import type { Client, Row } from "@libsql/client";

import type { StoredMessage } from "../store";
import type { Embed } from "./memory";

const EPISODE_GAP_MS = 45 * 60_000;
const EPISODE_MAX_MESSAGES = 60;
const EPISODE_MIN_TEXT = 3;
const PROMPT_MAX_CHARS = 12_000;

export const MOODS = ["hype", "chill", "planning", "venting", "banter", "serious", "wholesome", "chaotic"] as const;
export const KINDS = ["logistics", "inside joke", "news/update", "debate", "support", "media sharing", "small talk", "decision"] as const;

export interface Plan {
  what: string;
  /** YYYY-MM-DD when the messages pin down a day, else null. */
  date: string | null;
  /** The timing as the chat said it ("after christmas", "dec 28 4pm"). */
  when: string;
  who: string[];
  /** Message ids the plan was read from; always ids inside the episode. */
  sources: number[];
}

export interface Facets {
  title: string;
  summary: string;
  topics: string[];
  people: string[];
  places: string[];
  plans: Plan[];
  mood: (typeof MOODS)[number];
  kind: (typeof KINDS)[number];
}

/** A stretch of one conversation with no long silence, described by structured facets. */
export interface Episode extends Facets {
  conversation: string;
  startTs: number;
  endTs: number;
  firstId: number;
  maxId: number;
  messageCount: number;
  senders: string[];
}

export interface StoredEpisode extends Episode {
  id: number;
}

/** Reads facets from an episode's transcript (lines prefixed with #messageId). */
export type ExtractFacets = (transcript: string) => Promise<unknown>;

/** Splits a conversation's messages (chronological) at silences over 45 minutes, capped at 60 messages. */
export function segmentEpisodes(messages: StoredMessage[]): StoredMessage[][] {
  const episodes: StoredMessage[][] = [];
  let current: StoredMessage[] = [];
  for (const m of messages) {
    const last = current[current.length - 1];
    if (last && (m.ts - last.ts > EPISODE_GAP_MS || current.length >= EPISODE_MAX_MESSAGES)) {
      episodes.push(current);
      current = [];
    }
    current.push(m);
  }
  if (current.length) episodes.push(current);
  return episodes;
}

/** Turns one segment into an episode: an LLM reads the facets, and every plan is grounded in the segment's messages. */
export async function describeEpisode(
  conversation: string,
  messages: StoredMessage[],
  label: (sender: string) => string,
  stamp: (ts: number) => string,
  extract: ExtractFacets,
): Promise<Episode | null> {
  if (messages.filter((m) => m.text).length < EPISODE_MIN_TEXT) return null;
  const transcript = messages
    .map((m) => `#${m.id} [${stamp(m.ts)}] ${m.sender ? label(m.sender) : "(system)"}: ${m.text ?? "[" + m.kind + "]"}`)
    .join("\n")
    .slice(0, PROMPT_MAX_CHARS);
  const raw = (await extract(transcript)) as Partial<Facets> & { plans?: Partial<Plan>[] };
  const ids = new Set(messages.map((m) => m.id));
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 12) : []);
  const plans = (raw.plans ?? []).flatMap((p) => {
    const sources = (Array.isArray(p.sources) ? p.sources : []).map(Number).filter((id) => ids.has(id));
    if (!p.what || sources.length === 0) return [];
    const date = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
    return [{ what: String(p.what), date, when: String(p.when ?? ""), who: strings(p.who), sources }];
  });
  return {
    conversation,
    startTs: messages[0].ts,
    endTs: messages[messages.length - 1].ts,
    firstId: messages[0].id,
    maxId: Math.max(...messages.map((m) => m.id)),
    messageCount: messages.length,
    senders: [...new Set(messages.filter((m) => m.sender).map((m) => label(m.sender)))],
    title: String(raw.title ?? "").slice(0, 120),
    summary: String(raw.summary ?? "").slice(0, 600),
    topics: strings(raw.topics),
    people: strings(raw.people),
    places: strings(raw.places),
    plans,
    mood: MOODS.includes(raw.mood as Facets["mood"]) ? (raw.mood as Facets["mood"]) : "chill",
    kind: KINDS.includes(raw.kind as Facets["kind"]) ? (raw.kind as Facets["kind"]) : "small talk",
  };
}

const FACETS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "topics", "people", "places", "plans", "mood", "kind"],
  properties: {
    title: { type: "string", description: "3-7 word headline" },
    summary: { type: "string", description: "1-2 specific sentences with names, places and dates" },
    topics: { type: "array", items: { type: "string" }, description: "1-4 short topic tags" },
    people: { type: "array", items: { type: "string" }, description: "people talked about, not only the senders" },
    places: { type: "array", items: { type: "string" } },
    plans: {
      type: "array",
      description: "concrete plans, events or intentions; skip vague ones",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["what", "date", "when", "who", "sources"],
        properties: {
          what: { type: "string" },
          date: { type: ["string", "null"], description: "YYYY-MM-DD only if the messages pin down the day, resolved against the message timestamps" },
          when: { type: "string", description: "timing as said in the chat" },
          who: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "number" }, description: "#ids of the messages that state the plan" },
        },
      },
    },
    mood: { type: "string", enum: MOODS },
    kind: { type: "string", enum: KINDS },
  },
};

/** gpt-5-mini facet extraction with a strict JSON schema. */
export function openAiFacets(apiKey: string, model = "gpt-5-mini"): ExtractFacets {
  return async (transcript) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
        body: JSON.stringify({
          model,
          ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "minimal" } : {}),
          messages: [
            {
              role: "system",
              content:
                "Extract structured facets from this stretch of a chat. Be concrete and faithful to the messages; never guess. \"Me\" is the user. Use empty arrays when something is absent.",
            },
            { role: "user", content: transcript },
          ],
          response_format: { type: "json_schema", json_schema: { name: "facets", strict: true, schema: FACETS_SCHEMA } },
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices: { message: { content: string } }[] };
        return JSON.parse(json.choices[0].message.content);
      }
      if (attempt >= 2 || (res.status !== 429 && res.status < 500)) {
        throw new Error("Facet extraction failed: " + res.status + " " + (await res.text()).slice(0, 300));
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  };
}

/** The text an episode is embedded as: summaries cluster and retrieve far better than raw chat lines. */
export function episodeText(e: Facets): string {
  return `${e.title}. ${e.summary}${e.topics.length ? " Topics: " + e.topics.join(", ") + "." : ""}`;
}

export interface EpisodeFilter {
  conversations?: string[];
  after?: number;
  before?: number;
  /** Case-insensitive match on a sender or a person talked about. */
  person?: string;
  mood?: string;
  kind?: string;
}

const COLUMNS =
  "id, conversation, start_ts, end_ts, first_id, max_id, message_count, senders, title, summary, topics, people, places, plans, mood, kind";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    conversation TEXT NOT NULL,
    start_ts INTEGER NOT NULL,
    end_ts INTEGER NOT NULL,
    first_id INTEGER NOT NULL,
    max_id INTEGER NOT NULL,
    message_count INTEGER NOT NULL,
    senders TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    topics TEXT NOT NULL,
    people TEXT NOT NULL,
    places TEXT NOT NULL,
    plans TEXT NOT NULL,
    mood TEXT NOT NULL,
    kind TEXT NOT NULL,
    embedding F32_BLOB(512) NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS episodes_by_owner ON episodes(owner, start_ts)",
];

/** Episodes with facets and summary embeddings, in the same libSQL database as the messages. */
export class EpisodeIndex {
  constructor(private readonly db: Client) {}

  async migrate(): Promise<void> {
    await this.db.batch(SCHEMA, "write");
  }

  async indexedUpTo(owner: string): Promise<Map<string, number>> {
    const result = await this.db.execute({
      sql: "SELECT conversation, max(max_id) AS max_id FROM episodes WHERE owner = ? GROUP BY conversation",
      args: [owner],
    });
    return new Map(result.rows.map((r) => [String(r.conversation), Number(r.max_id)]));
  }

  async add(owner: string, episodes: Episode[], embed: Embed): Promise<void> {
    if (episodes.length === 0) return;
    const vectors = await embed(episodes.map(episodeText));
    await this.db.batch(
      episodes.map((e, i) => ({
        sql: `INSERT INTO episodes (owner, conversation, start_ts, end_ts, first_id, max_id, message_count, senders, title, summary, topics, people, places, plans, mood, kind, embedding)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,vector32(?))`,
        args: [
          owner, e.conversation, e.startTs, e.endTs, e.firstId, e.maxId, e.messageCount, JSON.stringify(e.senders),
          e.title, e.summary, JSON.stringify(e.topics), JSON.stringify(e.people), JSON.stringify(e.places),
          JSON.stringify(e.plans), e.mood, e.kind, JSON.stringify(vectors[i]),
        ],
      })),
      "write",
    );
  }

  /** Episodes matching the filter, newest first, or closest in meaning first when a query vector is given. */
  async find(owner: string, filter: EpisodeFilter, limit: number, vector?: number[]): Promise<(StoredEpisode & { distance?: number })[]> {
    const where = ["owner = ?"];
    const args: (string | number)[] = [owner];
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
    if (filter.person) {
      where.push("(lower(senders) LIKE ? OR lower(people) LIKE ?)");
      const like = "%" + filter.person.toLowerCase().replace(/[\\%_"]/g, "") + "%";
      args.push(like, like);
    }
    if (filter.mood) {
      where.push("mood = ?");
      args.push(filter.mood);
    }
    if (filter.kind) {
      where.push("kind = ?");
      args.push(filter.kind);
    }
    const result = await this.db.execute(
      vector
        ? {
            sql: `SELECT ${COLUMNS}, vector_distance_cos(embedding, vector32(?)) AS distance FROM episodes WHERE ${where.join(" AND ")} ORDER BY distance LIMIT ?`,
            args: [JSON.stringify(vector), ...args, limit],
          }
        : { sql: `SELECT ${COLUMNS} FROM episodes WHERE ${where.join(" AND ")} ORDER BY start_ts DESC LIMIT ?`, args: [...args, limit] },
    );
    return result.rows.map((r) => ({ ...toEpisode(r), ...(vector ? { distance: Number(r.distance) } : {}) }));
  }

  /** Summary embeddings of the matching episodes, for clustering a subset on demand. */
  async vectors(owner: string, ids: number[]): Promise<Map<number, number[]>> {
    if (ids.length === 0) return new Map();
    const result = await this.db.execute({
      sql: `SELECT id, vector_extract(embedding) AS v FROM episodes WHERE owner = ? AND id IN (${ids.map(() => "?").join(",")})`,
      args: [owner, ...ids],
    });
    return new Map(result.rows.map((r) => [Number(r.id), JSON.parse(String(r.v)) as number[]]));
  }

  async deleteOwner(owner: string): Promise<void> {
    for (;;) {
      const result = await this.db.execute({
        sql: "DELETE FROM episodes WHERE id IN (SELECT id FROM episodes WHERE owner = ? LIMIT 5000)",
        args: [owner],
      });
      if (result.rowsAffected === 0) return;
    }
  }
}

function toEpisode(r: Row): StoredEpisode {
  const list = (v: unknown) => JSON.parse(String(v)) as string[];
  return {
    id: Number(r.id),
    conversation: String(r.conversation),
    startTs: Number(r.start_ts),
    endTs: Number(r.end_ts),
    firstId: Number(r.first_id),
    maxId: Number(r.max_id),
    messageCount: Number(r.message_count),
    senders: list(r.senders),
    title: String(r.title),
    summary: String(r.summary),
    topics: list(r.topics),
    people: list(r.people),
    places: list(r.places),
    plans: JSON.parse(String(r.plans)) as Plan[],
    mood: String(r.mood) as Facets["mood"],
    kind: String(r.kind) as Facets["kind"],
  };
}

/**
 * Groups vectors by meaning with average-linkage agglomerative clustering on cosine distance, stopping when the
 * closest clusters are further apart than `threshold`. Exact and dependency-free; cubic time, so it is
 * capped at the first `maxItems` vectors.
 */
export function clusterVectors(vectors: number[][], threshold = 0.55, maxItems = 600): number[][] {
  const n = Math.min(vectors.length, maxItems);
  const unit = vectors.slice(0, n).map((v) => {
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  });
  const dist = (a: number[], b: number[]) => 1 - a.reduce((s, x, i) => s + x * b[i], 0);
  const d = unit.map((a, i) => unit.map((b, j) => (i === j ? Infinity : dist(a, b))));
  let clusters: number[][] = unit.map((_, i) => [i]);
  let alive = clusters.map((_, i) => i);
  for (;;) {
    let best = Infinity;
    let bi = -1;
    let bj = -1;
    for (let x = 0; x < alive.length; x++) {
      for (let y = x + 1; y < alive.length; y++) {
        const v = d[alive[x]][alive[y]];
        if (v < best) [best, bi, bj] = [v, alive[x], alive[y]];
      }
    }
    if (bi < 0 || best > threshold) break;
    const si = clusters[bi].length;
    const sj = clusters[bj].length;
    for (const k of alive) {
      if (k === bi || k === bj) continue;
      d[bi][k] = d[k][bi] = (d[bi][k] * si + d[bj][k] * sj) / (si + sj);
    }
    clusters[bi] = [...clusters[bi], ...clusters[bj]];
    clusters[bj] = [];
    alive = alive.filter((k) => k !== bj);
  }
  clusters = alive.map((k) => clusters[k]);
  return clusters.sort((a, b) => b.length - a.length);
}
