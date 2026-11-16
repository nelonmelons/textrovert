import { httpRouter } from "convex/server";

import { ApiError, listPeople, parseAskRequest } from "../pipeline/assistant/api";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

/**
 * The hosted Ask API: the same /ask, /people, /health, /friend, /story, /portrait, /stats and /reel as scripts/ask-server.ts, for an app that can't reach a laptop.
 * It serves exactly one owner's chats, named by the deployment's ASK_OWNER_KEY, and every route but /health needs the
 * x-api-key header to equal ASK_API_KEY. With either unset the API answers 503, so a deployment never serves by accident.
 */
const http = httpRouter();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-api-key",
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

/** The owner whose chats this deployment serves, or an error response when the request may not use it. */
function gate(request: Request): { ownerKey: string } | Response {
  const ownerKey = process.env.ASK_OWNER_KEY?.trim();
  const apiKey = process.env.ASK_API_KEY?.trim();
  if (!ownerKey || !apiKey) return json(503, { error: "The Ask API isn't configured" });
  if (!sameKey(request.headers.get("x-api-key") ?? "", apiKey)) return json(401, { error: "Missing or wrong API key" });
  return { ownerKey };
}

const preflight = httpAction(async () => new Response(null, { status: 204, headers: CORS }));
for (const path of ["/ask", "/people", "/health", "/friend", "/story", "/portrait", "/stats", "/reel"]) http.route({ path, method: "OPTIONS", handler: preflight });

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const ownerKey = process.env.ASK_OWNER_KEY?.trim();
    if (!ownerKey || !process.env.ASK_API_KEY?.trim()) return json(503, { ok: false, error: "The Ask API isn't configured" });
    const conversations = await ctx.runQuery(internal.conversations.directory, { ownerKey });
    return json(200, { ok: true, chats: conversations.length });
  }),
});

http.route({
  path: "/people",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const allowed = gate(request);
    if (allowed instanceof Response) return allowed;
    const conversations = await ctx.runQuery(internal.conversations.directory, { ownerKey: allowed.ownerKey });
    return json(200, { people: listPeople(conversations) });
  }),
});

http.route({
  path: "/ask",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const allowed = gate(request);
    if (allowed instanceof Response) return allowed;
    const raw = await request.text();
    if (raw.length > 100_000) return json(413, { error: "Request too large" });
    let ask;
    try {
      ask = parseAskRequest(JSON.parse(raw || "{}"));
    } catch (error) {
      return json(400, { error: error instanceof ApiError ? error.message : "Body must be a JSON object" });
    }
    const result = await ctx.runAction(internal.assistant.answerApi, {
      ownerKey: allowed.ownerKey,
      question: ask.question,
      ...(ask.person ? { person: ask.person } : {}),
      ...(ask.history ? { history: ask.history } : {}),
    });
    return json(result.status, result.body);
  }),
});

/** /friend, /story, /portrait, /stats and /reel: pipeline/assistant/api.ts friendRoute, the same as the local ask-server. */
const friendHandler = httpAction(async (ctx, request) => {
  const allowed = gate(request);
  if (allowed instanceof Response) return allowed;
  const url = new URL(request.url);
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body && body.length > 100_000) return json(413, { error: "Request too large" });
  const result = await ctx.runAction(internal.assistant.friendApi, {
    ownerKey: allowed.ownerKey,
    method: request.method,
    path: url.pathname,
    query: url.search,
    ...(body ? { body } : {}),
  });
  return new Response(result.text, { status: result.status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
});
for (const path of ["/friend", "/story", "/portrait", "/stats", "/reel"]) http.route({ path, method: "GET", handler: friendHandler });
http.route({ path: "/reel", method: "POST", handler: friendHandler });

export default http;
