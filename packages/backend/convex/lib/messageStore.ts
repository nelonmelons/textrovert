import type { Client, InStatement } from "@libsql/client";
import { rankConversations, type Conversation, type Message, type Participant } from "@textrovert/ingest";

export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    uid TEXT NOT NULL,
    conversation TEXT NOT NULL,
    ts INTEGER NOT NULL,
    sender TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT,
    meta TEXT
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS messages_owner_uid ON messages(owner, uid)",
  "CREATE INDEX IF NOT EXISTS messages_owner_conversation_ts ON messages(owner, conversation, ts)",
  "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(text, content='messages', content_rowid='id', tokenize='unicode61 remove_diacritics 2')",
  "CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages WHEN new.text IS NOT NULL BEGIN INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text); END",
  "CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages WHEN old.text IS NOT NULL BEGIN INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text); END",
];

export interface ChatRef {
  owner: string;
  conversation: string;
}

interface Meta {
  tsLocal: string | null;
  tsConfidence: Message["tsConfidence"];
  isSelf: boolean;
  replyToUid?: string;
  replyQuote?: string;
  reactions?: Message["reactions"];
  edited?: boolean;
  readAfter?: string;
  sourceRef: string;
}

export async function ensureSchema(db: Client): Promise<void> {
  await db.batch(SCHEMA, "write");
}

function uids(conversation: string, messages: Message[]): string[] {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const base = `${conversation}|${m.ts ?? ""}|${m.senderId}|${m.text}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  });
}

const toEpoch = (ts: string | null) => (ts ? Date.parse(`${ts}Z`) : 0);

export async function insertMessages(db: Client, chat: ChatRef, conv: Conversation): Promise<number> {
  const keys = uids(chat.conversation, conv.messages);
  const statements: InStatement[] = conv.messages.map((m, k) => {
    const meta: Meta = { tsLocal: m.ts, tsConfidence: m.tsConfidence, isSelf: m.isSelf, sourceRef: m.sourceRef };
    if (m.replyTo !== undefined) meta.replyToUid = keys[m.replyTo];
    if (m.replyQuote) meta.replyQuote = m.replyQuote;
    if (m.reactions?.length) meta.reactions = m.reactions;
    if (m.edited) meta.edited = true;
    if (m.readAfter) meta.readAfter = m.readAfter;
    return {
      sql: "INSERT INTO messages (owner, uid, conversation, ts, sender, kind, text, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner, uid) DO NOTHING",
      args: [chat.owner, keys[k], chat.conversation, toEpoch(m.ts), m.senderId, m.kind, m.text, JSON.stringify(meta)],
    };
  });
  let inserted = 0;
  for (let start = 0; start < statements.length; start += 500) {
    const results = await db.batch(statements.slice(start, start + 500), "write");
    inserted += results.reduce((n, r) => n + r.rowsAffected, 0);
  }
  return inserted;
}

interface Row {
  uid: string;
  sender: string;
  kind: Message["kind"];
  text: string | null;
  meta: string | null;
}

function toMessages(rows: Row[]): Message[] {
  const index = new Map(rows.map((r, i) => [r.uid, i]));
  return rows.map((r, i) => {
    const meta = JSON.parse(r.meta ?? "{}") as Partial<Meta>;
    const m: Message = {
      i,
      ts: meta.tsLocal ?? null,
      tsConfidence: meta.tsConfidence ?? "none",
      senderId: r.sender,
      isSelf: meta.isSelf ?? false,
      kind: r.kind,
      text: r.text ?? "",
      sourceRef: meta.sourceRef ?? "",
    };
    const replyTo = meta.replyToUid ? index.get(meta.replyToUid) : undefined;
    if (replyTo !== undefined) m.replyTo = replyTo;
    if (meta.replyQuote) m.replyQuote = meta.replyQuote;
    if (meta.reactions?.length) m.reactions = meta.reactions;
    if (meta.edited) m.edited = true;
    if (meta.readAfter) m.readAfter = meta.readAfter;
    return m;
  });
}

async function allMessages(db: Client, chat: ChatRef): Promise<Message[]> {
  const { rows } = await db.execute({
    sql: "SELECT uid, sender, kind, text, meta FROM messages WHERE owner = ? AND conversation = ? ORDER BY ts, id",
    args: [chat.owner, chat.conversation],
  });
  return toMessages(rows as unknown as Row[]);
}

export interface ChatMeta {
  source: Conversation["source"];
  sourceId?: string | null;
  title: string | null;
  isGroup: boolean;
  participants: Participant[];
}

export async function loadConversation(db: Client, chat: ChatRef, meta: ChatMeta): Promise<Conversation> {
  return { ...meta, messages: await allMessages(db, chat), warnings: [] };
}

export async function getMessagePage(db: Client, chat: ChatRef, offset: number, limit: number): Promise<{ total: number; messages: Message[] }> {
  const all = await allMessages(db, chat);
  return { total: all.length, messages: all.slice(offset, offset + limit) };
}

export interface SearchHit {
  conversation: string;
  ts: string | null;
  senderId: string;
  isSelf: boolean;
  text: string;
  snippet: string;
}

export async function searchMessages(db: Client, owner: string, query: string, conversations: string[], limit: number): Promise<SearchHit[]> {
  if (!conversations.length || !query.trim()) return [];
  const match = query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" ");
  const { rows } = await db.execute({
    sql: `SELECT m.conversation, m.sender, m.text, m.meta, snippet(messages_fts, 0, '[', ']', '…', 12) AS snippet
          FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
          WHERE messages_fts MATCH ? AND m.owner = ? AND m.conversation IN (${conversations.map(() => "?").join(",")})
          ORDER BY rank LIMIT ?`,
    args: [match, owner, ...conversations, limit],
  });
  return rows.map((r) => {
    const meta = JSON.parse((r.meta as string | null) ?? "{}") as Partial<Meta>;
    return {
      conversation: r.conversation as string,
      ts: meta.tsLocal ?? null,
      senderId: r.sender as string,
      isSelf: meta.isSelf ?? false,
      text: (r.text as string | null) ?? "",
      snippet: r.snippet as string,
    };
  });
}

export function summarize(conv: Conversation) {
  const s = rankConversations([conv])[0];
  const timed = conv.messages.filter((m) => m.ts);
  return {
    messageCount: conv.messages.length,
    fromMe: s?.fromMe ?? 0,
    fromThem: s?.fromThem ?? 0,
    recentCount: s?.recentCount ?? 0,
    lastMessage: s?.lastMessage ?? null,
    score: s?.score ?? 0,
    firstTs: timed[0]?.ts ?? null,
    lastTs: timed[timed.length - 1]?.ts ?? null,
  };
}
