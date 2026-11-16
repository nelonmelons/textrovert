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
 * POST /wrapped {conversationId, from?, through?, model?, ...} → one Wrapped edition for a DM (see README)
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { openAIModelSource } from "@textrovert/wrapped/openai";

import { openAiComplete, type ConversationRef } from "../pipeline/assistant/agent";
import { answerRequest, ApiError, listPeople, parseAskRequest } from "../pipeline/assistant/api";
import { EpisodeIndex } from "../pipeline/assistant/episodes";
import { parseWrappedRequest, wrappedRequest } from "../pipeline/assistant/wrappedApi";
import { FactIndex } from "../pipeline/assistant/facts";
import { MemoryIndex, openAiEmbedder } from "../pipeline/assistant/memory";
import { MessageStore } from "../pipeline/store";
import { safeTimeZone } from "../pipeline/time";

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

const loadRows = async (ref: ConversationRef) => {
  const rows = [];
  for await (const page of store.scan(owner, [ref.key])) rows.push(...page.messages);
  return rows;
};

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
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
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
      const result = await wrappedRequest(parseWrappedRequest(await readJson(req)), { conversations, loadRows, timeZone, modelSource: wrappedModel });
      const highlights = result.outcome.kind === "edition" ? result.outcome.edition.highlights.length : 0;
      console.log(`wrapped: ${result.outcome.kind}, ${highlights} highlights, model ${result.model.status} in ${Date.now() - started}ms`);
      return send(res, 200, result);
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
