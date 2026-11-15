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
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { dateRangeFromDays } from "@textrovert/wrapped";
import { openAIModelSource } from "@textrovert/wrapped/openai";

import { ask, openAiComplete, type ChatTurn, type ConversationRef } from "../pipeline/assistant/agent";
import { EpisodeIndex } from "../pipeline/assistant/episodes";
import { FactIndex } from "../pipeline/assistant/facts";
import { MemoryIndex, openAiEmbedder } from "../pipeline/assistant/memory";
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

const selfNames = new Set(conversations.map((c) => c.selfName).filter((s): s is string => !!s));
const people = (() => {
  const byName = new Map<string, { name: string; dm: boolean; chats: number; messages: number; lastAt: number; dmMessages: number }>();
  for (const c of conversations) {
    for (const name of c.participants) {
      if (selfNames.has(name) || name === "Instagram User") continue;
      const p = byName.get(name) ?? { name, dm: false, chats: 0, messages: 0, lastAt: 0, dmMessages: 0 };
      p.chats++;
      p.messages += c.messageCount;
      p.lastAt = Math.max(p.lastAt, c.lastAt);
      if (c.kind === "dm") {
        p.dm = true;
        p.dmMessages += c.messageCount;
      }
      byName.set(name, p);
    }
  }
  return [...byName.values()].sort((a, b) => b.dmMessages - a.dmMessages || b.messages - a.messages).map(({ dmMessages: _, ...p }) => ({ ...p, lastAt: new Date(p.lastAt).toISOString() }));
})();

const chatsWith = (person: string) => {
  const want = person.toLowerCase();
  return conversations.filter((c) => c.participants.some((p) => p.toLowerCase() === want));
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function answer(question: string, person: string | undefined, history: ChatTurn[] | undefined) {
  const scoped = person ? chatsWith(person) : conversations;
  if (person && scoped.length === 0) throw new HttpError(404, "No chats with " + person);
  const out = await ask({
    question: person ? `About ${person}: ${question}` : question,
    history,
    conversations: scoped,
    owner,
    store,
    memory,
    episodes,
    facts,
    embed,
    complete,
    timeZone,
    now: Date.now(),
  });
  const originals = new Map((await store.byIds(owner, out.citations.map((c) => c.messageId))).map((m) => [m.id, m]));
  return {
    answer: out.answer,
    person: person ?? null,
    chats: scoped.length,
    citations: out.citations.map((c) => ({
      n: c.n,
      messageId: c.messageId,
      sender: c.sender,
      fromMe: c.fromMe,
      chat: c.conversationTitle,
      chatId: c.conversationId,
      sentAt: new Date(c.ts).toISOString(),
      text: originals.get(c.messageId)?.text ?? c.quote,
      quote: c.quote,
    })),
  };
}

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

async function wrapped(body: Record<string, unknown>) {
  const id = typeof body.conversationId === "string" ? body.conversationId : "";
  const ref = conversations.find((c) => c.id === id);
  if (!ref) throw new HttpError(404, "No conversation " + JSON.stringify(id));
  if (!isDay(body.from) || !isDay(body.through)) throw new HttpError(400, "from and through must be YYYY-MM-DD dates");
  const range = dateRangeFromDays(body.from, body.through, timeZone);
  if (range.end <= range.start) throw new HttpError(400, "through must not be before from");
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
    "access-control-allow-headers": "content-type",
  });
  res.end(body === null ? undefined : JSON.stringify(body));
};

const readJson = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, "Request too large");
  }
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // reported below
  }
  throw new HttpError(400, "Body must be a JSON object");
};

const toHistory = (value: unknown): ChatTurn[] | undefined =>
  Array.isArray(value)
    ? value
        .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }))
    : undefined;

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const started = Date.now();
  try {
    if (req.method === "OPTIONS") return send(res, 204, null);
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true, chats: conversations.length });
    if (req.method === "GET" && path === "/people") return send(res, 200, { people });
    if (req.method === "POST" && path === "/ask") {
      const body = await readJson(req);
      const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";
      if (!question) throw new HttpError(400, "Ask a question");
      const person = typeof body.person === "string" && body.person.trim() ? body.person.trim() : undefined;
      const result = await answer(question, person, toHistory(body.history));
      console.log(`ask${person ? " (scoped)" : ""}: ${result.citations.length} citations in ${Date.now() - started}ms`);
      return send(res, 200, result);
    }
    if (req.method === "POST" && path === "/wrapped") {
      const result = await wrapped(await readJson(req));
      const highlights = result.outcome.kind === "edition" ? result.outcome.edition.highlights.length : 0;
      console.log(`wrapped: ${result.outcome.kind}, ${highlights} highlights, model ${result.model.status} in ${Date.now() - started}ms`);
      return send(res, 200, result);
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 500) console.error("ask-server:", message);
    send(res, status, { error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ask-server on http://127.0.0.1:${port}: ${conversations.length} chats, ${people.length} people, ${timeZone}`);
});
