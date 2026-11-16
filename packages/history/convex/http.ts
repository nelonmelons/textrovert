import { httpRouter } from "convex/server";

import { ApiError, listPeople, parseAskRequest, parseWrappedRequest } from "../pipeline/assistant/requests";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, type ActionCtx } from "./_generated/server";

/**
 * The hosted API the phone app calls (/ask, /people, /wrapped, /friend, /story, /portrait, /stats, /today and /reel are the same
 * as scripts/ask-server.ts, plus /account, /upload and /status for new users). Every route but /health needs the x-api-key header to equal ASK_API_KEY.
 * The owner is the x-owner-key header (an account from POST /account); without it, read routes fall back to the
 * deployment's demo owner (ASK_OWNER_KEY), so the demo keeps working. Uploads always need a real x-owner-key.
 * Shapes are documented in packages/history/README.md ("Hosted API").
 */
const http = httpRouter();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-api-key, x-owner-key, x-file-name, x-time-zone, x-self-name",
  "access-control-max-age": "86400",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });

/** Compares without exiting at the first differing character, so response time doesn't reveal the key. */
function sameKey(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

type Owner = { ownerKey: string; demo: boolean };

/**
 * Checks the API key and resolves the owner. "fallback" serves the demo owner when no x-owner-key is sent,
 * "required" insists on a real account, "none" only checks the API key.
 */
async function gate(ctx: ActionCtx, request: Request, owner: "fallback" | "required"): Promise<Owner | Response>;
async function gate(ctx: ActionCtx, request: Request, owner: "none"): Promise<Record<string, never> | Response>;
async function gate(ctx: ActionCtx, request: Request, owner: "fallback" | "required" | "none") {
  const apiKey = process.env.ASK_API_KEY?.trim();
  if (!apiKey) return json(503, { error: "The API isn't configured" });
  if (!sameKey(request.headers.get("x-api-key") ?? "", apiKey)) return json(401, { error: "Missing or wrong API key" });
  if (owner === "none") return {};
  const given = request.headers.get("x-owner-key")?.trim();
  if (given) {
    if (given.length > 200 || !(await ctx.runQuery(internal.owners.exists, { ownerKey: given }))) {
      return json(401, { error: "Unknown owner key" });
    }
    return { ownerKey: given, demo: false };
  }
  if (owner === "required") return json(400, { error: "Send x-owner-key (create one with POST /account)" });
  const demo = process.env.ASK_OWNER_KEY?.trim();
  if (!demo) return json(503, { error: "No demo owner is configured; send x-owner-key" });
  return { ownerKey: demo, demo: true };
}

const preflight = httpAction(async () => new Response(null, { status: 204, headers: CORS }));
for (const path of ["/ask", "/people", "/health", "/account", "/upload", "/upload/url", "/upload/commit", "/status", "/onboarding", "/wrapped", "/friend", "/story", "/portrait", "/stats", "/today", "/reel"]) {
  http.route({ path, method: "OPTIONS", handler: preflight });
}

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const ownerKey = process.env.ASK_OWNER_KEY?.trim();
    if (!ownerKey || !process.env.ASK_API_KEY?.trim()) return json(503, { ok: false, error: "The API isn't configured" });
    const conversations = await ctx.runQuery(internal.conversations.directory, { ownerKey });
    return json(200, { ok: true, chats: conversations.length });
  }),
});

/** POST /account → { ownerKey }. Creates an account the same way the Mac app does; the phone keeps the key. */
http.route({
  path: "/account",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const allowed = await gate(ctx, request, "none");
    if (allowed instanceof Response) return allowed;
    const ownerKey: string = await ctx.runAction(api.owners.create, {});
    return json(200, { ownerKey });
  }),
});

async function startUpload(
  ctx: ActionCtx,
  ownerKey: string,
  storageId: Id<"_storage">,
  meta: { fileName: string; timeZone: string; selfName?: string },
): Promise<Response> {
  try {
    const uploadId = await ctx.runMutation(api.uploads.start, {
      ownerKey,
      storageId,
      fileName: meta.fileName || "upload",
      timeZone: meta.timeZone,
      ...(meta.selfName ? { selfName: meta.selfName } : {}),
    });
    return json(200, { uploadId });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Couldn't start the upload" });
  }
}

/**
 * POST /upload → { uploadId }. The body is the file itself (any content type; name it with ?fileName= or the
 * x-file-name header), or multipart/form-data with the file in "file". Optional timeZone and selfName as query
 * params, headers (x-time-zone, x-self-name) or form fields. HTTP bodies are capped at 20 MB; for bigger files use
 * POST /upload/url, then POST /upload/commit.
 */
http.route({
  path: "/upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "required");
    if (owner instanceof Response) return owner;
    const url = new URL(request.url);
    const meta = {
      fileName: url.searchParams.get("fileName") ?? request.headers.get("x-file-name") ?? "",
      timeZone: url.searchParams.get("timeZone") ?? request.headers.get("x-time-zone") ?? "",
      selfName: url.searchParams.get("selfName") ?? request.headers.get("x-self-name") ?? undefined,
    };
    let file: Blob;
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return json(400, { error: "Couldn't read the multipart body; send the raw file instead" });
      }
      const part = form.get("file");
      if (!part || typeof part === "string") return json(400, { error: 'Put the file in the multipart field "file"' });
      file = part;
      const partName = (part as File).name;
      meta.fileName = form.get("fileName")?.toString() || meta.fileName || partName || "";
      meta.timeZone = form.get("timeZone")?.toString() || meta.timeZone;
      meta.selfName = form.get("selfName")?.toString() || meta.selfName;
    } else {
      file = await request.blob();
    }
    if (file.size === 0) return json(400, { error: "The file is empty" });
    const storageId = await ctx.storage.store(file);
    return startUpload(ctx, owner.ownerKey, storageId, meta);
  }),
});

/** POST /upload/url → { uploadUrl }. POST the file to uploadUrl (it answers { storageId }), then call /upload/commit. */
http.route({
  path: "/upload/url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "required");
    if (owner instanceof Response) return owner;
    const uploadUrl: string = await ctx.runMutation(api.uploads.generateUploadUrl, { ownerKey: owner.ownerKey });
    return json(200, { uploadUrl });
  }),
});

/** POST /upload/commit { storageId, fileName, timeZone?, selfName? } → { uploadId }. */
http.route({
  path: "/upload/commit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "required");
    if (owner instanceof Response) return owner;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await request.text()) || "{}");
    } catch {
      return json(400, { error: "Body must be a JSON object" });
    }
    if (typeof body.storageId !== "string" || !body.storageId) return json(400, { error: "storageId is required" });
    return startUpload(ctx, owner.ownerKey, body.storageId as Id<"_storage">, {
      fileName: typeof body.fileName === "string" ? body.fileName : "",
      timeZone: typeof body.timeZone === "string" ? body.timeZone : "",
      selfName: typeof body.selfName === "string" && body.selfName.trim() ? body.selfName : undefined,
    });
  }),
});

type StageState = "pending" | "running" | "ready" | "failed";
const stage = (state: StageState, done: number, total: number) => ({ state, done, total });

/**
 * GET /status[?uploadId=] → { upload, stages: { stats, search, ask, episodes, facts } }. Each stage is
 * { state: "pending" | "running" | "ready" | "failed", done, total }. stats/search count conversations and messages
 * of the upload (the latest one unless uploadId is given); ask/episodes/facts count chats indexed by each pass.
 */
http.route({
  path: "/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "fallback");
    if (owner instanceof Response) return owner;
    const wanted = new URL(request.url).searchParams.get("uploadId");
    const uploads = await ctx.runQuery(api.uploads.list, { ownerKey: owner.ownerKey });
    const upload = (wanted ? uploads.find((u) => u._id === wanted) : uploads[0]) ?? null;
    const indexing = await ctx.runQuery(internal.indexing.get, { ownerKey: owner.ownerKey });

    const status = upload?.status ?? (indexing ? "done" : "queued");
    const p = upload?.progress ?? { messagesParsed: 0, messagesStored: 0, conversations: 0, conversationsAnalyzed: 0 };
    const failed = status === "failed";
    const stats =
      status === "done"
        ? stage("ready", p.conversations, p.conversations)
        : stage(failed ? "failed" : status === "analyzing" ? "running" : "pending", p.conversationsAnalyzed, p.conversations);
    const search =
      status === "done" || status === "analyzing"
        ? stage("ready", p.messagesStored, p.messagesStored)
        : stage(failed ? "failed" : status === "parsing" ? "running" : "pending", p.messagesStored, p.messagesParsed);

    // The index starts once analysis is done; a run that started before this upload finished is an older one.
    const current =
      indexing && (!upload || (upload.status === "done" && (!upload.finishedAt || indexing.startedAt >= upload.finishedAt - 5_000)))
        ? indexing
        : null;
    const total = current?.total ?? 0;
    const afterStats: StageState = failed ? "failed" : status === "done" ? "running" : "pending";
    const ask = !current
      ? stage(afterStats, 0, 0)
      : stage(current.chunks >= current.priority ? "ready" : "running", current.chunks, total);
    const episodes = !current
      ? stage(failed ? "failed" : "pending", 0, 0)
      : stage(current.episodes >= total ? "ready" : current.chunks >= total ? "running" : "pending", current.episodes, total);
    const facts = !current
      ? stage(failed ? "failed" : "pending", 0, 0)
      : stage(current.facts >= total ? "ready" : current.episodes >= total ? "running" : "pending", current.facts, total);

    return json(200, {
      owner: owner.demo ? "demo" : "account",
      upload: upload
        ? { id: upload._id, fileName: upload.fileName, status: upload.status, error: upload.error, progress: upload.progress }
        : null,
      stages: { stats, search, ask, episodes, facts },
    });
  }),
});

http.route({
  path: "/people",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "fallback");
    if (owner instanceof Response) return owner;
    const conversations = await ctx.runQuery(internal.conversations.directory, { ownerKey: owner.ownerKey });
    return json(200, { people: listPeople(conversations) });
  }),
});

http.route({
  path: "/ask",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "fallback");
    if (owner instanceof Response) return owner;
    const raw = await request.text();
    if (raw.length > 100_000) return json(413, { error: "Request too large" });
    let ask;
    try {
      ask = parseAskRequest(JSON.parse(raw || "{}"));
    } catch (error) {
      return json(400, { error: error instanceof ApiError ? error.message : "Body must be a JSON object" });
    }
    const result = await ctx.runAction(internal.assistant.answerApi, {
      ownerKey: owner.ownerKey,
      question: ask.question,
      ...(ask.person ? { person: ask.person } : {}),
      ...(ask.history ? { history: ask.history } : {}),
    });
    return json(result.status, result.body);
  }),
});

http.route({
  path: "/wrapped",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "fallback");
    if (owner instanceof Response) return owner;
    const raw = await request.text();
    if (raw.length > 100_000) return json(413, { error: "Request too large" });
    let parsed;
    try {
      parsed = parseWrappedRequest(JSON.parse(raw || "{}"));
    } catch (error) {
      return json(400, { error: error instanceof ApiError ? error.message : "Body must be a JSON object" });
    }
    const result = await ctx.runAction(internal.assistant.wrappedApi, { ownerKey: owner.ownerKey, request: parsed });
    return json(result.status, result.body);
  }),
});

/** /friend, /story, /portrait, /stats, /today and /reel: pipeline/assistant/api.ts friendRoute, the same as the local ask-server. */
const friendHandler = httpAction(async (ctx, request) => {
  const owner = await gate(ctx, request, "fallback");
  if (owner instanceof Response) return owner;
  const url = new URL(request.url);
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body && body.length > 100_000) return json(413, { error: "Request too large" });
  const result = await ctx.runAction(internal.assistant.friendApi, {
    ownerKey: owner.ownerKey,
    method: request.method,
    path: url.pathname,
    query: url.search,
    ...(body ? { body } : {}),
  });
  return new Response(result.text, { status: result.status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
});
for (const path of ["/friend", "/story", "/portrait", "/stats", "/today", "/reel"]) http.route({ path, method: "GET", handler: friendHandler });
http.route({ path: "/reel", method: "POST", handler: friendHandler });

/**
 * POST /onboarding { chatType?, app?, method?, selfName?, notes?, email?, uploadId?, fileName?, skippedUpload? } →
 * { ok: true }. Saves the onboarding answers on the x-owner-key account; GET /onboarding reads them back.
 */
const clean = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
http.route({
  path: "/onboarding",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "required");
    if (owner instanceof Response) return owner;
    const raw = await request.text();
    if (raw.length > 20_000) return json(413, { error: "Request too large" });
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(raw || "{}");
    } catch {
      return json(400, { error: "Body must be a JSON object" });
    }
    if (!b || typeof b !== "object" || Array.isArray(b)) return json(400, { error: "Body must be a JSON object" });
    const email = clean(b.email, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "That email address doesn't look right." });
    const saved = await ctx.runMutation(internal.owners.saveOnboarding, {
      ownerKey: owner.ownerKey,
      onboarding: {
        chatType: clean(b.chatType, 40),
        app: clean(b.app, 40),
        method: clean(b.method, 40),
        selfName: clean(b.selfName, 100),
        notes: clean(b.notes, 4000),
        email,
        uploadId: clean(b.uploadId, 100),
        fileName: clean(b.fileName, 200),
        skippedUpload: b.skippedUpload === true,
        savedAt: Date.now(),
      },
    });
    return saved ? json(200, { ok: true }) : json(401, { error: "Unknown owner key" });
  }),
});

http.route({
  path: "/onboarding",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const owner = await gate(ctx, request, "required");
    if (owner instanceof Response) return owner;
    return json(200, { onboarding: await ctx.runQuery(internal.owners.getOnboarding, { ownerKey: owner.ownerKey }) });
  }),
});

export default http;
