/**
 * Local dev API for the mobile Ask screen: runs the assistant over a local message database, read-only.
 *
 *   ASK_DB             path to the libSQL/SQLite database (messages, chunks, episodes, facts)
 *   ASK_OWNER          store owner the rows belong to
 *   ASK_CONVERSATIONS  path to a JSON array of ConversationRef (the chat directory the assistant scopes to)
 *   ASK_ENV_FILE       file holding OPENAI_API_KEY=..., or set OPENAI_API_KEY directly
 *   ASK_TZ             IANA time zone of the owner (defaults to this machine's)
 *   ASK_PORT           defaults to 8787; binds 127.0.0.1 only
 *   ASSISTANT_MODEL    optional chat model override
 *
 * POST /ask {question, person?, history?} → {answer, citations: [{n, messageId, sender, fromMe, chat, chatId, sentAt, text, quote}]}
 * GET /people → {people: [{name, dm, chats, messages, lastAt}]}, most-messaged DMs first; dates are ISO 8601 strings
 * POST /wrapped {conversationId, from, through, model?, ...} → one Wrapped edition for a DM (see README)
 * GET /friend, GET /story, GET /portrait, GET|POST /reel → see pipeline/assistant/api.ts friendRoute; GET /reels/<id>.mp4 serves a rendered reel
 *
 *   ASK_CACHE_DB       optional writable libSQL file for cached memoirs and the portrait
 *                      (defaults to packages/history/.data/ask-cache.db; ASK_DB itself is never written)
 *   ASK_REELS          set to 0 to turn reel rendering off
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { dateRangeFromDays } from "@textrovert/wrapped";
import { openAIModelSource } from "@textrovert/wrapped/openai";

import { openAiComplete, type ConversationRef } from "../pipeline/assistant/agent";
import { answerRequest, ApiError, friendRoute, listPeople, parseAskRequest, RawJson, type ApiReel, type FriendContext, type ReelRenderer } from "../pipeline/assistant/api";
import { EpisodeIndex } from "../pipeline/assistant/episodes";
import { FactIndex } from "../pipeline/assistant/facts";
import { MemoryIndex, openAiEmbedder } from "../pipeline/assistant/memory";
import { openAiStoryWriter } from "../pipeline/portrait/build";
import { PortraitCache } from "../pipeline/portrait/cache";
import { MessageStore } from "../pipeline/store";
import { safeTimeZone } from "../pipeline/time";
import { runWrapped } from "../pipeline/wrapped";

const fail = (message: string): never => {
  console.error("ask-server: " + message);
  process.exit(1);
};
const requireEnv = (name: string, what: string) => process.env[name]?.trim() || fail(`set ${name} (${what})`);
const requireFile = (name: string, what: string) => {
  const path = resolve(requireEnv(name, what));
  return existsSync(path) ? path : fail(`${name} points at ${path}, which doesn't exist`);
};

const dbPath = requireFile("ASK_DB", "path to the local message database");
const owner = requireEnv("ASK_OWNER", "store owner of the rows in ASK_DB");
const conversationsPath = requireFile("ASK_CONVERSATIONS", "path to the JSON chat directory");
const apiKey =
  process.env.OPENAI_API_KEY?.trim() ||
  (process.env.ASK_ENV_FILE
    ? readFileSync(requireFile("ASK_ENV_FILE", "env file with OPENAI_API_KEY"), "utf8").match(/^\s*OPENAI_API_KEY\s*=\s*["']?([^"'\s]+)/m)?.[1]
    : undefined) ||
  fail("set OPENAI_API_KEY, or ASK_ENV_FILE to a file containing OPENAI_API_KEY=...");
const timeZone = safeTimeZone(process.env.ASK_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone);
const port = Number(process.env.ASK_PORT || 8787);

const conversations: ConversationRef[] = JSON.parse(readFileSync(conversationsPath, "utf8"));
if (!Array.isArray(conversations) || conversations.length === 0) fail(conversationsPath + " has no conversations");
conversations.sort((a, b) => b.lastAt - a.lastAt);

// One connection, so the pragmas below hold for every query; query_only makes SQLite refuse any write.
const db = createClient({ url: "file:" + dbPath, concurrency: 1 });
await db.execute("PRAGMA busy_timeout = 10000");
await db.execute("PRAGMA query_only = ON");
const store = new MessageStore(db);
const memory = new MemoryIndex(db);
const episodes = new EpisodeIndex(db);
const facts = new FactIndex(db);
const embed = openAiEmbedder(apiKey);
const complete = openAiComplete(apiKey, process.env.ASSISTANT_MODEL || undefined);
const wrappedModel = openAIModelSource({ apiKey, model: process.env.WRAPPED_MODEL || undefined });

const people = listPeople(conversations);

const historyRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cachePath = resolve(process.env.ASK_CACHE_DB?.trim() || join(historyRoot, ".data/ask-cache.db"));
mkdirSync(dirname(cachePath), { recursive: true });
const cache = new PortraitCache(createClient({ url: "file:" + cachePath }));
await cache.migrate();
const friendContext: FriendContext = { conversations, owner, store, episodes, facts, cache, timeZone, writeStory: openAiStoryWriter(apiKey) };

/**
 * Renders reels with packages/reels: episode-props picks the messages, render writes <id>.mp4. One render at a time;
 * finished videos are reused across restarts.
 */
const reelsRoot = resolve(historyRoot, "../reels");
const reelsOut = join(reelsRoot, ".data/app");
const reelJobs = new Map<number, ApiReel>();
let reelQueue = Promise.resolve();
const run = (args: string[]) =>
  new Promise<void>((done, failed) => {
    const child = spawn("pnpm", ["exec", "tsx", ...args], { cwd: reelsRoot, env: { ...process.env, OPENAI_API_KEY: apiKey }, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-2000)));
    child.on("error", failed);
    child.on("close", (code) => (code === 0 ? done() : failed(new Error(stderr.trim().split("\n").pop() || "exit " + code))));
  });
const reels: ReelRenderer | null =
  process.env.ASK_REELS === "0" || !existsSync(join(reelsRoot, "scripts/render.ts"))
    ? null
    : {
        status(episodeId) {
          if (existsSync(join(reelsOut, episodeId + ".mp4")) && reelJobs.get(episodeId)?.status !== "rendering") return { status: "ready", episodeId, url: "/reels/" + episodeId + ".mp4" };
          return reelJobs.get(episodeId) ?? { status: "none", episodeId };
        },
        start(episodeId) {
          const now = this.status(episodeId);
          if (now.status === "ready" || now.status === "rendering") return now;
          const job: ApiReel = { status: "rendering", episodeId };
          reelJobs.set(episodeId, job);
          const props = join(reelsOut, episodeId + ".json");
          reelQueue = reelQueue.then(async () => {
            const started = Date.now();
            try {
              mkdirSync(reelsOut, { recursive: true });
              await run(["scripts/episode-props.ts", String(episodeId), "--db", dbPath, "--refs", conversationsPath, "--owner", owner, "--tz", timeZone, "--out", props]);
              await run(["scripts/render.ts", props, "--out", reelsOut]);
              reelJobs.set(episodeId, { status: "ready", episodeId, url: "/reels/" + episodeId + ".mp4" });
              console.log(`reel ${episodeId}: rendered in ${Date.now() - started}ms`);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              reelJobs.set(episodeId, { status: "failed", episodeId, error: message });
              console.error(`reel ${episodeId}: failed:`, message);
            }
          });
          return job;
        },
      };

/** Streams a rendered reel with byte-range support, which AVPlayer needs to play it. */
function sendReel(req: IncomingMessage, res: ServerResponse, name: string) {
  const file = join(reelsOut, name);
  if (!/^\d+\.mp4$/.test(name) || !existsSync(file)) return send(res, 404, { error: "No such reel" });
  const size = statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  const headers = { "content-type": "video/mp4", "accept-ranges": "bytes", "access-control-allow-origin": "*" };
  if (!range) {
    res.writeHead(200, { ...headers, "content-length": size });
    return createReadStream(file).pipe(res);
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    res.writeHead(416, { ...headers, "content-range": `bytes */${size}` });
    return res.end();
  }
  res.writeHead(206, { ...headers, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}` });
  createReadStream(file, { start, end }).pipe(res);
}

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

async function wrapped(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Body must be a JSON object");
  const body = input as Record<string, unknown>;
  const id = typeof body.conversationId === "string" ? body.conversationId : "";
  const ref = conversations.find((c) => c.id === id);
  if (!ref) throw new ApiError(404, "No conversation " + JSON.stringify(id));
  if (!isDay(body.from) || !isDay(body.through)) throw new ApiError(400, "from and through must be YYYY-MM-DD dates");
  const range = dateRangeFromDays(body.from, body.through, timeZone);
  if (range.end <= range.start) throw new ApiError(400, "through must not be before from");
  const rows = [];
  if (ref.kind === "dm") for await (const page of store.scan(owner, [ref.key])) rows.push(...page.messages);
  const avoiding = Array.isArray(body.avoiding) ? body.avoiding.filter((x): x is string => typeof x === "string") : [];
  const run = await runWrapped({
    ref,
    rows,
    range,
    avoiding,
    number: typeof body.number === "number" && body.number >= 1 ? Math.floor(body.number) : 1,
    modelSource: body.model === false ? null : wrappedModel,
    modelOptions: { includeWarmMoments: body.includeWarmMoments === true, allowAffectionateTeasing: body.allowAffectionateTeasing === true },
    timeoutMs: typeof body.timeoutMs === "number" && body.timeoutMs > 0 ? Math.min(body.timeoutMs, 120_000) : undefined,
    debug: body.debug === true,
  });
  const { messages: _, ...conversation } = run.conversation;
  return { conversation: { ...conversation, title: ref.title, kind: ref.kind, ownerID: "owner" }, range, outcome: run.outcome, model: run.model };
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-api-key",
  });
  res.end(body === null ? undefined : JSON.stringify(body));
};

const readJson = async (req: IncomingMessage): Promise<unknown> => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new ApiError(413, "Request too large");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new ApiError(400, "Body must be a JSON object");
  }
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const started = Date.now();
  try {
    if (req.method === "OPTIONS") return send(res, 204, null);
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true, chats: conversations.length });
    if (req.method === "GET" && path === "/people") return send(res, 200, { people });
    if (req.method === "POST" && path === "/ask") {
      const request = parseAskRequest(await readJson(req));
      const result = await answerRequest(request, { conversations, owner, store, memory, episodes, facts, embed, complete, timeZone, now: Date.now() });
      console.log(`ask${request.person ? " (scoped)" : ""}: ${result.citations.length} citations in ${Date.now() - started}ms`);
      return send(res, 200, result);
    }
    if (req.method === "POST" && path === "/wrapped") {
      const result = await wrapped(await readJson(req));
      const highlights = result.outcome.kind === "edition" ? result.outcome.edition.highlights.length : 0;
      console.log(`wrapped: ${result.outcome.kind}, ${highlights} highlights, model ${result.model.status} in ${Date.now() - started}ms`);
      return send(res, 200, result);
    }
    if (req.method === "GET" && path.startsWith("/reels/")) return sendReel(req, res, path.slice("/reels/".length));
    const result = await friendRoute(req.method ?? "GET", path, url.searchParams, req.method === "POST" ? await readJson(req) : null, friendContext, reels);
    if (result !== null) {
      if (!(result instanceof RawJson)) return send(res, 200, result);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
      return res.end(result.text);
    }
    throw new ApiError(404, "Not found");
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 500) console.error("ask-server:", message);
    send(res, status, { error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ask-server on http://127.0.0.1:${port}: ${conversations.length} chats, ${people.length} people, ${timeZone}`);
});
