import type { Client, InStatement, Row } from "@libsql/client";

import type { MessageKind } from "./types";

/** A message as written to the store. `uid` is deterministic, so re-uploads of the same export are skipped. */
export interface MessageRow {
  uid: string;
  conversation: string;
  ts: number;
  sender: string;
  kind: MessageKind;
  text: string | null;
  meta: string | null;
}

export interface StoredMessage {
  id: number;
  conversation: string;
  ts: number;
  sender: string;
  kind: MessageKind;
  text: string | null;
  meta: string | null;
}

export interface SearchHit extends StoredMessage {
  /** Matching excerpt with matched terms wrapped in ** markers. */
  snippet: string;
}

export interface Cursor {
  ts: number;
  id: number;
}

export interface TextRow {
  id: number;
  conversation: string;
  ts: number;
  sender: string;
  text: string;
}

/** A conversation to read texts from, with the sender name the user has in it. */
export interface TextSource {
  key: string;
  selfName: string;
}

const SCHEMA = [
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
  // One index serves both dedupe and paging. Keys arrive in time order within a chat, so each write batch touches
  // a few adjacent pages instead of one random page per row.
  "CREATE UNIQUE INDEX IF NOT EXISTS messages_dedupe ON messages(owner, conversation, ts, uid)",
];

const FTS_SCHEMA = [
  "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(text, content='messages', content_rowid='id', tokenize='unicode61 remove_diacritics 2')",
  `CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages WHEN new.text IS NOT NULL BEGIN
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages WHEN old.text IS NOT NULL BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END`,
];

const COLUMNS = "id, conversation, ts, sender, kind, text, meta";
const ROWS_PER_INSERT = 400;
const INSERTS_PER_REQUEST = 5;
const SCAN_GROUP = 20;

/**
 * Full message history in SQLite (Turso/libSQL in production, a local file in tests and scripts).
 * Rows are partitioned by owner; FTS5 indexes message text for search.
 */
export class MessageStore {
  private fullText = true;

  constructor(private readonly db: Client) {}

  async migrate(): Promise<void> {
    await this.db.batch(SCHEMA, "write");
    try {
      await this.db.batch(FTS_SCHEMA, "write");
    } catch (error) {
      // An engine without FTS5 (Turso's new engine) still stores everything; search falls back to substring matching.
      this.fullText = false;
      console.warn("Message store: no FTS5, search uses substring matching.", error instanceof Error ? error.message : error);
    }
  }

  /** Inserts rows, skipping any already stored for this owner. Returns how many were new. */
  async insert(owner: string, rows: MessageRow[]): Promise<number> {
    const statements: InStatement[] = [];
    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
      const chunk = rows.slice(i, i + ROWS_PER_INSERT);
      const args: (string | number | null)[] = [];
      for (const r of chunk) args.push(owner, r.uid, r.conversation, r.ts, r.sender, r.kind, r.text, r.meta);
      statements.push({
        sql:
          "INSERT OR IGNORE INTO messages (owner, uid, conversation, ts, sender, kind, text, meta) VALUES " +
          chunk.map(() => "(?,?,?,?,?,?,?,?)").join(","),
        args,
      });
    }
    let inserted = 0;
    for (let i = 0; i < statements.length; i += INSERTS_PER_REQUEST) {
      for (const result of await this.db.batch(statements.slice(i, i + INSERTS_PER_REQUEST), "write")) {
        inserted += result.rowsAffected;
      }
    }
    return inserted;
  }

  /** Newest-first page of one conversation, continuing before `before` when given. */
  async page(owner: string, conversation: string, limit: number, before: Cursor | null): Promise<StoredMessage[]> {
    const result = await this.db.execute(
      before
        ? {
            sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? AND ts <= ? AND (ts < ? OR id < ?) ORDER BY ts DESC, id DESC LIMIT ?`,
            args: [owner, conversation, before.ts, before.ts, before.id, limit],
          }
        : {
            sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? ORDER BY ts DESC, id DESC LIMIT ?`,
            args: [owner, conversation, limit],
          },
    );
    return result.rows.map(toStored);
  }

  /** Chronological window of messages around one message, e.g. to open a search hit in context. */
  async around(owner: string, conversation: string, at: Cursor, limit: number): Promise<StoredMessage[]> {
    const half = Math.max(1, Math.floor(limit / 2));
    const [older, newer] = await this.db.batch(
      [
        {
          sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? AND ts <= ? AND (ts < ? OR id < ?) ORDER BY ts DESC, id DESC LIMIT ?`,
          args: [owner, conversation, at.ts, at.ts, at.id, half],
        },
        {
          sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? AND ts >= ? AND (ts > ? OR id >= ?) ORDER BY ts, id LIMIT ?`,
          args: [owner, conversation, at.ts, at.ts, at.id, limit - half],
        },
      ],
      "read",
    );
    return [...older.rows.map(toStored).reverse(), ...newer.rows.map(toStored)];
  }

  /**
   * Streams conversations in chronological order, one page at a time. Small conversations are fetched
   * together in one round trip, large ones continue with keyset pagination.
   */
  async *scan(
    owner: string,
    conversations: string[],
    pageSize = 2000,
  ): AsyncGenerator<{ conversation: string; messages: StoredMessage[]; done: boolean }> {
    for (let i = 0; i < conversations.length; i += SCAN_GROUP) {
      const group = conversations.slice(i, i + SCAN_GROUP);
      // One row past the page tells whether another page follows.
      const firstPages = await this.db.batch(
        group.map((conversation) => ({
          sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? ORDER BY ts, id LIMIT ?`,
          args: [owner, conversation, pageSize + 1],
        })),
        "read",
      );
      for (let j = 0; j < group.length; j++) {
        let rows = firstPages[j].rows.map(toStored);
        for (;;) {
          const done = rows.length <= pageSize;
          const messages = done ? rows : rows.slice(0, pageSize);
          yield { conversation: group[j], messages, done };
          if (done) break;
          const last = messages[messages.length - 1];
          const next = await this.db.execute({
            sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? AND ts >= ? AND (ts > ? OR id > ?) ORDER BY ts, id LIMIT ?`,
            args: [owner, group[j], last.ts, last.ts, last.id, pageSize + 1],
          });
          rows = next.rows.map(toStored);
        }
      }
    }
  }

  /** The owner's messages with these ids, in no particular order; ids that aren't the owner's are skipped. */
  async byIds(owner: string, ids: number[]): Promise<StoredMessage[]> {
    if (ids.length === 0) return [];
    const result = await this.db.execute({
      sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND id IN (${ids.map(() => "?").join(",")})`,
      args: [owner, ...ids],
    });
    return result.rows.map(toStored);
  }

  /** Chronological messages of one conversation sent between two instants, inclusive. */
  async between(owner: string, conversation: string, fromTs: number, toTs: number, limit: number): Promise<StoredMessage[]> {
    const result = await this.db.execute({
      sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? AND ts >= ? AND ts <= ? ORDER BY ts, id LIMIT ?`,
      args: [owner, conversation, fromTs, toTs, limit],
    });
    return result.rows.map(toStored);
  }

  /** Chronological messages of one conversation stored after row `afterId`, whatever their timestamps. */
  async storedAfter(owner: string, conversation: string, afterId: number): Promise<StoredMessage[]> {
    const result = await this.db.execute({
      sql: `SELECT ${COLUMNS} FROM messages WHERE owner = ? AND conversation = ? AND id > ? ORDER BY ts, id`,
      args: [owner, conversation, afterId],
    });
    return result.rows.map(toStored);
  }

  /**
   * Streams the texts of the given conversations a page at a time, oldest first: only the ones the user sent
   * (`from: "self"`) or only the ones everyone else sent (`from: "others"`), at least `minLength` characters long.
   */
  async *texts(
    owner: string,
    sources: TextSource[],
    from: "self" | "others",
    minLength = 1,
    pageSize = 2000,
  ): AsyncGenerator<TextRow[]> {
    const sql =
      "SELECT id, conversation, ts, sender, text FROM messages WHERE owner = ? AND conversation = ? AND sender " +
      (from === "self" ? "=" : "<>") +
      " ? AND text IS NOT NULL AND length(text) >= ?";
    for (let i = 0; i < sources.length; i += SCAN_GROUP) {
      const group = sources.slice(i, i + SCAN_GROUP);
      const firstPages = await this.db.batch(
        group.map((s) => ({ sql: sql + " ORDER BY ts, id LIMIT ?", args: [owner, s.key, s.selfName, minLength, pageSize + 1] })),
        "read",
      );
      for (let j = 0; j < group.length; j++) {
        let rows = firstPages[j].rows.map(toTextRow);
        for (;;) {
          const done = rows.length <= pageSize;
          const page = done ? rows : rows.slice(0, pageSize);
          if (page.length > 0) yield page;
          if (done) break;
          const last = page[page.length - 1];
          const next = await this.db.execute({
            sql: sql + " AND ts >= ? AND (ts > ? OR id > ?) ORDER BY ts, id LIMIT ?",
            args: [owner, group[j].key, group[j].selfName, minLength, last.ts, last.ts, last.id, pageSize + 1],
          });
          rows = next.rows.map(toTextRow);
        }
      }
    }
  }

  async search(owner: string, query: string, limit: number, conversation?: string): Promise<SearchHit[]> {
    if (!this.fullText) return this.substringSearch(owner, query, limit, conversation);
    const match = toFtsQuery(query);
    if (!match) return [];
    const result = await this.db.execute({
      sql: `SELECT m.id, m.conversation, m.ts, m.sender, m.kind, m.text, m.meta,
                   snippet(messages_fts, 0, '**', '**', '…', 12) AS snippet
            FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
            WHERE messages_fts MATCH ? AND m.owner = ?${conversation ? " AND m.conversation = ?" : ""}
            ORDER BY bm25(messages_fts) LIMIT ?`,
      args: conversation ? [match, owner, conversation, limit] : [match, owner, limit],
    });
    return result.rows.map((row) => ({ ...toStored(row), snippet: String(row.snippet) }));
  }

  /** Newest messages containing every query word; used when the database has no FTS5. */
  private async substringSearch(owner: string, query: string, limit: number, conversation?: string): Promise<SearchHit[]> {
    const terms = queryTerms(query);
    if (!terms) return [];
    const likes = terms.map((t) => "%" + t.replace(/[\\%_]/g, (c) => "\\" + c) + "%");
    const result = await this.db.execute({
      sql:
        `SELECT ${COLUMNS} FROM messages WHERE owner = ?${conversation ? " AND conversation = ?" : ""}` +
        " AND text LIKE ? ESCAPE '\\'".repeat(terms.length) +
        " ORDER BY ts DESC, id DESC LIMIT ?",
      args: [owner, ...(conversation ? [conversation] : []), ...likes, limit],
    });
    return result.rows.map((row) => {
      const message = toStored(row);
      return { ...message, snippet: highlight(message.text ?? "", terms) };
    });
  }

  async count(owner: string, conversation?: string): Promise<number> {
    const result = await this.db.execute(
      conversation
        ? { sql: "SELECT count(*) AS n FROM messages WHERE owner = ? AND conversation = ?", args: [owner, conversation] }
        : { sql: "SELECT count(*) AS n FROM messages WHERE owner = ?", args: [owner] },
    );
    return Number(result.rows[0].n);
  }

  /** Deletes everything stored for an owner, in batches so huge histories don't make one giant transaction. */
  async deleteOwner(owner: string): Promise<number> {
    let total = 0;
    for (;;) {
      const result = await this.db.execute({
        sql: "DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE owner = ? LIMIT 5000)",
        args: [owner],
      });
      total += result.rowsAffected;
      if (result.rowsAffected === 0) return total;
    }
  }
}

function queryTerms(input: string): string[] | null {
  return input.normalize("NFKC").match(/[\p{L}\p{N}]+/gu);
}

/** Turns free text into a safe FTS5 query: every word must match, the last one as a prefix. */
export function toFtsQuery(input: string): string | null {
  const terms = queryTerms(input);
  if (!terms) return null;
  return terms.map((term, i) => `"${term}"${i === terms.length - 1 ? "*" : ""}`).join(" ");
}

/** An excerpt around the first match with every term wrapped in ** markers, like FTS5's snippet(). */
function highlight(text: string, terms: string[]): string {
  const re = new RegExp(terms.join("|"), "giu");
  const first = Math.max(0, text.search(re));
  const start = Math.max(0, first - 40);
  const end = Math.min(text.length, first + 80);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(re, (m) => "**" + m + "**") + (end < text.length ? "…" : "");
}

function toTextRow(row: Row): TextRow {
  return {
    id: Number(row.id),
    conversation: String(row.conversation),
    ts: Number(row.ts),
    sender: String(row.sender),
    text: String(row.text),
  };
}

function toStored(row: Row): StoredMessage {
  return {
    id: Number(row.id),
    conversation: String(row.conversation),
    ts: Number(row.ts),
    sender: String(row.sender),
    kind: row.kind as MessageKind,
    text: row.text === null ? null : String(row.text),
    meta: row.meta === null ? null : String(row.meta),
  };
}
