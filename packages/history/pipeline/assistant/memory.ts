import type { Client } from "@libsql/client";

import type { StoredMessage } from "../store";

/** Small embeddings keep an exact per-owner scan fast enough without a shared ANN index. */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 512;
const EMBED_BATCH = 256;
const CHUNK_MAX_MESSAGES = 15;
const CHUNK_GAP_MS = 3 * 60 * 60_000;
const LINE_MAX_CHARS = 400;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    conversation TEXT NOT NULL,
    start_ts INTEGER NOT NULL,
    end_ts INTEGER NOT NULL,
    max_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding F32_BLOB(${EMBEDDING_DIMS}) NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS chunks_by_owner ON chunks(owner, conversation, end_ts)",
];

/** A run of consecutive messages in one conversation, embedded together so a search finds a moment, not a line. */
export interface Chunk {
  conversation: string;
  startTs: number;
  endTs: number;
  /** Highest message row id in the chunk; later rows are what still needs indexing. */
  maxId: number;
  text: string;
}

export interface ChunkHit extends Chunk {
  distance: number;
}

export type Embed = (texts: string[]) => Promise<number[][]>;

/** Splits a conversation's messages (chronological) into chunks of at most 15, breaking at long silences. */
export function chunkMessages(conversation: string, messages: StoredMessage[], label: (sender: string) => string): Chunk[] {
  const chunks: Chunk[] = [];
  let current: StoredMessage[] = [];
  const close = () => {
    const lines = current.filter((m) => m.text).map((m) => (m.sender ? label(m.sender) + ": " : "") + m.text!.slice(0, LINE_MAX_CHARS));
    if (lines.length > 0) {
      chunks.push({
        conversation,
        startTs: current[0].ts,
        endTs: current[current.length - 1].ts,
        maxId: Math.max(...current.map((m) => m.id)),
        text: lines.join("\n"),
      });
    }
    current = [];
  };
  for (const m of messages) {
    const last = current[current.length - 1];
    if (last && (current.length >= CHUNK_MAX_MESSAGES || m.ts - last.ts > CHUNK_GAP_MS)) close();
    current.push(m);
  }
  close();
  return chunks;
}

/** OpenAI embeddings, batched. */
export function openAiEmbedder(apiKey: string): Embed {
  return async (texts) => {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS, input: texts.slice(i, i + EMBED_BATCH) }),
      });
      if (!res.ok) throw new Error("Embedding request failed: " + res.status + " " + (await res.text()).slice(0, 300));
      const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      out.push(...json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return out;
  };
}

/**
 * Semantic memory over the message store: chunk embeddings in the same libSQL database, searched by cosine distance
 * within one owner's chunks. Indexing is incremental by message row id, so new uploads (even of older history) are
 * picked up without re-embedding what is already there.
 */
export class MemoryIndex {
  constructor(private readonly db: Client) {}

  async migrate(): Promise<void> {
    await this.db.batch(SCHEMA, "write");
  }

  /** Highest message row id already indexed for each of the owner's conversations. */
  async indexedUpTo(owner: string): Promise<Map<string, number>> {
    const result = await this.db.execute({
      sql: "SELECT conversation, max(max_id) AS max_id FROM chunks WHERE owner = ? GROUP BY conversation",
      args: [owner],
    });
    return new Map(result.rows.map((r) => [String(r.conversation), Number(r.max_id)]));
  }

  async add(owner: string, chunks: Chunk[], embed: Embed): Promise<void> {
    if (chunks.length === 0) return;
    const vectors = await embed(chunks.map((c) => c.text));
    await this.db.batch(
      chunks.map((c, i) => ({
        sql: "INSERT INTO chunks (owner, conversation, start_ts, end_ts, max_id, text, embedding) VALUES (?,?,?,?,?,?,vector32(?))",
        args: [owner, c.conversation, c.startTs, c.endTs, c.maxId, c.text, JSON.stringify(vectors[i])],
      })),
      "write",
    );
  }

  /** Chunks closest in meaning to the query vector, optionally within some conversations and a time range. */
  async nearest(
    owner: string,
    vector: number[],
    limit: number,
    filter: { conversations?: string[]; after?: number; before?: number } = {},
  ): Promise<ChunkHit[]> {
    const where = ["owner = ?"];
    const args: (string | number)[] = [JSON.stringify(vector), owner];
    if (filter.conversations?.length) {
      where.push("conversation IN (" + filter.conversations.map(() => "?").join(",") + ")");
      args.push(...filter.conversations);
    }
    if (filter.after !== undefined) {
      where.push("end_ts >= ?");
      args.push(filter.after);
    }
    if (filter.before !== undefined) {
      where.push("start_ts <= ?");
      args.push(filter.before);
    }
    args.push(limit);
    const result = await this.db.execute({
      sql: `SELECT conversation, start_ts, end_ts, max_id, text, vector_distance_cos(embedding, vector32(?)) AS distance
            FROM chunks WHERE ${where.join(" AND ")} ORDER BY distance LIMIT ?`,
      args,
    });
    return result.rows.map((r) => ({
      conversation: String(r.conversation),
      startTs: Number(r.start_ts),
      endTs: Number(r.end_ts),
      maxId: Number(r.max_id),
      text: String(r.text),
      distance: Number(r.distance),
    }));
  }

  async deleteOwner(owner: string): Promise<void> {
    for (;;) {
      const result = await this.db.execute({
        sql: "DELETE FROM chunks WHERE id IN (SELECT id FROM chunks WHERE owner = ? LIMIT 5000)",
        args: [owner],
      });
      if (result.rowsAffected === 0) return;
    }
  }
}
