import type { Client, Row } from "@libsql/client";

import type { StoredMessage } from "../store";
import type { Embed } from "./memory";

export const PREDICATES = ["likes", "dislikes", "wants", "works at", "studies", "lives in", "relationship", "health", "milestone", "habit"] as const;
/** Predicates with one current value at a time: a newer one usually replaces the older one. */
const SINGLE_VALUED: readonly string[] = ["works at", "studies", "lives in", "relationship"];
/** Things that happened stay true; they are never replaced. */
const PERMANENT: readonly string[] = ["milestone"];
export type Predicate = (typeof PREDICATES)[number];

/** A durable thing the chats say about someone, pinned to the exact characters it was read from. */
export interface Fact {
  conversation: string;
  /** Who the fact is about, as named in the chat; "Me" is the user. */
  subject: string;
  predicate: Predicate;
  object: string;
  messageId: number;
  /** Character span of the evidence in the message text: text.slice(quoteStart, quoteEnd) is the quote. */
  quoteStart: number;
  quoteEnd: number;
  quote: string;
  /** When it became known: the source message's time. */
  validFrom: number;
  /** When a later fact replaced it; null while it still holds. */
  validTo: number | null;
}

export interface StoredFact extends Fact {
  id: number;
  supersededBy: number | null;
}

export type ExtractFacts = (transcript: string) => Promise<unknown>;
/** Decides which existing facts a new fact replaces (contradicts or updates) and whether it repeats one. */
export type ResolveFact = (fresh: string, existing: { id: number; text: string }[]) => Promise<{ duplicateOf: number | null; invalidates: number[] }>;

const MIN_IMPORTANCE = 4;

const factText = (f: Pick<Fact, "subject" | "predicate" | "object">) => `${f.subject} ${f.predicate}: ${f.object}`;

/**
 * Finds a quote inside a message the way a reader would: exact first, then ignoring case, curly quotes and runs of
 * whitespace. Returns the character span in the original text, or null when the words aren't there.
 */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim();
  if (!q) return null;
  const exact = text.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length };
  const fold = (c: string) => (c === "\u2018" || c === "\u2019" ? "'" : c === "\u201C" || c === "\u201D" ? '"' : c.toLowerCase());
  const norm: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = /\s/.test(text[i]) ? " " : fold(text[i]);
    if (c === " " && norm[norm.length - 1] === " ") continue;
    norm.push(c);
    map.push(i);
  }
  const needle = [...q].map((c) => (/\s/.test(c) ? " " : fold(c))).join("").replace(/ +/g, " ");
  const at = norm.join("").indexOf(needle);
  if (at < 0) return null;
  return { start: map[at], end: map[at + needle.length - 1] + 1 };
}

/** Reads durable facts from one episode's messages; each must quote its source message exactly. */
export async function extractFacts(
  conversation: string,
  messages: StoredMessage[],
  label: (sender: string) => string,
  stamp: (ts: number) => string,
  extract: ExtractFacts,
): Promise<Fact[]> {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const transcript = messages
    .filter((m) => m.text)
    .map((m) => `#${m.id} [${stamp(m.ts)}] ${m.sender ? label(m.sender) : "(system)"}: ${m.text}`)
    .join("\n")
    .slice(0, 12_000);
  if (!transcript) return [];
  const raw = (await extract(transcript)) as {
    facts?: { subject?: unknown; predicate?: unknown; object?: unknown; message_id?: unknown; quote?: unknown; importance?: unknown }[];
  };
  const facts: Fact[] = [];
  for (const f of raw.facts ?? []) {
    const message = byId.get(Number(f.message_id));
    if (!message?.text || typeof f.subject !== "string" || typeof f.object !== "string" || !f.object.trim()) continue;
    if (!PREDICATES.includes(f.predicate as Predicate)) continue;
    if (typeof f.importance === "number" && f.importance < MIN_IMPORTANCE) continue;
    const span = locateQuote(message.text, String(f.quote ?? ""));
    if (!span) continue;
    facts.push({
      conversation,
      subject: f.subject.trim().slice(0, 80),
      predicate: f.predicate as Predicate,
      object: f.object.trim().slice(0, 300),
      messageId: message.id,
      quoteStart: span.start,
      quoteEnd: span.end,
      quote: message.text.slice(span.start, span.end),
      validFrom: message.ts,
      validTo: null,
    });
  }
  return facts;
}

const FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["facts"],
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "predicate", "object", "message_id", "quote", "importance"],
        properties: {
          importance: {
            type: "integer",
            description:
              "1-5: how much a close friend would want to remember this in 6 months. 5 = life events, job, school, home, relationship, health, strong lasting preferences or gift wishes. 1 = passing remark or today's logistics.",
          },
          subject: { type: "string", description: "who it is about, as named in the chat; Me for the user" },
          predicate: { type: "string", enum: PREDICATES },
          object: { type: "string", description: "the fact itself, short and specific" },
          message_id: { type: "number", description: "#id of the message that states it" },
          quote: { type: "string", description: "the exact words from that message that show it, copied verbatim" },
        },
      },
    },
  },
};

const RESOLVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["duplicate_of", "invalidates"],
  properties: {
    duplicate_of: { type: ["number", "null"], description: "id of an existing fact that says the same thing" },
    invalidates: { type: "array", items: { type: "number" }, description: "ids of existing facts the new fact makes no longer true" },
  },
};

async function chatJson(apiKey: string, model: string, system: string, user: string, name: string, schema: object, reasoning = "minimal"): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: reasoning } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      }),
    });
    if (res.ok) return JSON.parse(((await res.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content);
    if (attempt >= 2 || (res.status !== 429 && res.status < 500)) throw new Error(name + " failed: " + res.status + " " + (await res.text()).slice(0, 300));
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

export function openAiFactExtractor(apiKey: string, model = "gpt-5-mini", reasoning = "low"): ExtractFacts {
  return (transcript) =>
    chatJson(
      apiKey,
      model,
      [
        "Extract durable facts about people from this chat that a good friend would still want to remember months from now:",
        "what someone likes, dislikes or wants (gift ideas count), where they work, study or live, relationships, health, milestones (got a job, moved, graduated, birthday, breakup) and lasting habits.",
        "Skip reactions, banter, one-off logistics, where someone happens to be right now, plans for a specific day, jokes, insults, and anything only implied. Never record judgments about someone's character.",
        "lives in means where someone resides, works at means their employer or role, milestone means a life event that already happened.",
        "subject is the person the fact is about, by name; \"Me\" is the user. object is a short third-person paraphrase (\"vanilla candles\", \"software intern at AMD\"), not a copy of the message.",
        "quote copies the exact words from the cited message that show it. Most stretches of chat contain no such facts: return an empty list then.",
      ].join(" "),
      transcript,
      "facts",
      FACTS_SCHEMA,
      reasoning,
    );
}

export function openAiFactResolver(apiKey: string, model = "gpt-5-mini"): ResolveFact {
  return async (fresh, existing) => {
    const out = (await chatJson(
      apiKey,
      model,
      "A new fact was learned about someone. Compare it with what was known before. duplicate_of: an existing fact that says essentially the same thing, else null. invalidates: only existing facts the new one clearly makes no longer true, such as a new job replacing an old one, a move, a breakup, or explicitly no longer liking something. When both could be true at once, invalidate nothing. When unsure, invalidate nothing.",
      "New: " + fresh + "\nKnown:\n" + existing.map((e) => `[${e.id}] ${e.text}`).join("\n"),
      "resolution",
      RESOLVE_SCHEMA,
    )) as { duplicate_of: number | null; invalidates: number[] };
    const ids = new Set(existing.map((e) => e.id));
    return {
      duplicateOf: out.duplicate_of !== null && ids.has(out.duplicate_of) ? out.duplicate_of : null,
      invalidates: out.invalidates.filter((id) => ids.has(id)),
    };
  };
}

const COLUMNS = "id, conversation, subject, predicate, object, message_id, quote_start, quote_end, quote, valid_from, valid_to, superseded_by";
const CANDIDATE_DISTANCE = 0.45;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    conversation TEXT NOT NULL,
    subject TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    quote_start INTEGER NOT NULL,
    quote_end INTEGER NOT NULL,
    quote TEXT NOT NULL,
    valid_from INTEGER NOT NULL,
    valid_to INTEGER,
    superseded_by INTEGER,
    embedding F32_BLOB(512) NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS facts_by_subject ON facts(owner, subject_key, predicate, valid_from)",
  "CREATE TABLE IF NOT EXISTS facts_progress (owner TEXT NOT NULL, conversation TEXT NOT NULL, max_id INTEGER NOT NULL, PRIMARY KEY (owner, conversation))",
];

const subjectKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Facts with validity windows: a new fact that contradicts or updates an earlier one about the same subject closes
 * the earlier one's window instead of deleting it, so the history of how things changed stays queryable.
 */
export class FactIndex {
  constructor(private readonly db: Client) {}

  async migrate(): Promise<void> {
    await this.db.batch(SCHEMA, "write");
  }

  async progress(owner: string): Promise<Map<string, number>> {
    const result = await this.db.execute({ sql: "SELECT conversation, max_id FROM facts_progress WHERE owner = ?", args: [owner] });
    return new Map(result.rows.map((r) => [String(r.conversation), Number(r.max_id)]));
  }

  async markProgress(owner: string, conversation: string, maxId: number): Promise<void> {
    await this.db.execute({
      sql: "INSERT INTO facts_progress (owner, conversation, max_id) VALUES (?,?,?) ON CONFLICT(owner, conversation) DO UPDATE SET max_id = max(max_id, excluded.max_id)",
      args: [owner, conversation, maxId],
    });
  }

  /** Adds facts in time order, resolving each against the open facts about the same subject and predicate. */
  async add(owner: string, facts: Fact[], embed: Embed, resolve: ResolveFact): Promise<{ added: number; duplicates: number; invalidated: number }> {
    const stats = { added: 0, duplicates: 0, invalidated: 0 };
    if (facts.length === 0) return stats;
    const ordered = [...facts].sort((a, b) => a.validFrom - b.validFrom);
    const vectors = await embed(ordered.map(factText));
    for (let i = 0; i < ordered.length; i++) {
      const f = ordered[i];
      const candidates = await this.db.execute({
        sql: `SELECT id, subject, predicate, object FROM facts
              WHERE owner = ? AND subject_key = ? AND predicate = ? AND valid_to IS NULL AND valid_from <= ?
                AND (? OR vector_distance_cos(embedding, vector32(?)) < ?)
              ORDER BY vector_distance_cos(embedding, vector32(?)) LIMIT 5`,
        args: [owner, subjectKey(f.subject), f.predicate, f.validFrom, SINGLE_VALUED.includes(f.predicate) ? 1 : 0, JSON.stringify(vectors[i]), CANDIDATE_DISTANCE, JSON.stringify(vectors[i])],
      });
      const existing = candidates.rows.map((r) => ({ id: Number(r.id), text: `${r.subject} ${r.predicate}: ${r.object}` }));
      const decision = existing.length ? await resolve(factText(f), existing) : { duplicateOf: null, invalidates: [] as number[] };
      if (PERMANENT.includes(f.predicate)) decision.invalidates = [];
      if (decision.duplicateOf !== null) {
        stats.duplicates++;
        continue;
      }
      const inserted = await this.db.execute({
        sql: `INSERT INTO facts (owner, conversation, subject, subject_key, predicate, object, message_id, quote_start, quote_end, quote, valid_from, embedding)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,vector32(?)) RETURNING id`,
        args: [owner, f.conversation, f.subject, subjectKey(f.subject), f.predicate, f.object, f.messageId, f.quoteStart, f.quoteEnd, f.quote, f.validFrom, JSON.stringify(vectors[i])],
      });
      const id = Number(inserted.rows[0].id);
      for (const old of decision.invalidates) {
        await this.db.execute({
          sql: "UPDATE facts SET valid_to = ?, superseded_by = ? WHERE owner = ? AND id = ? AND valid_to IS NULL",
          args: [f.validFrom, id, owner, old],
        });
        stats.invalidated++;
      }
      stats.added++;
    }
    return stats;
  }

  /** Facts about a person (matched on name), newest first; closed facts only with includeHistory. */
  async about(owner: string, subject: string, options: { includeHistory?: boolean; since?: number; limit?: number } = {}): Promise<StoredFact[]> {
    const where = ["owner = ?", "subject_key LIKE ?"];
    const args: (string | number)[] = [owner, "%" + subjectKey(subject).replace(/[%_]/g, "") + "%"];
    if (!options.includeHistory) where.push("valid_to IS NULL");
    if (options.since !== undefined) {
      where.push("valid_from >= ?");
      args.push(options.since);
    }
    const result = await this.db.execute({
      sql: `SELECT ${COLUMNS} FROM facts WHERE ${where.join(" AND ")} ORDER BY valid_from DESC LIMIT ?`,
      args: [...args, options.limit ?? 60],
    });
    return result.rows.map(toFact);
  }

  /** Facts closest in meaning to a query, open ones by default. */
  async search(owner: string, vector: number[], limit: number, includeHistory = false): Promise<StoredFact[]> {
    const result = await this.db.execute({
      sql: `SELECT ${COLUMNS} FROM facts WHERE owner = ?${includeHistory ? "" : " AND valid_to IS NULL"} ORDER BY vector_distance_cos(embedding, vector32(?)) LIMIT ?`,
      args: [owner, JSON.stringify(vector), limit],
    });
    return result.rows.map(toFact);
  }

  async deleteOwner(owner: string): Promise<void> {
    await this.db.execute({ sql: "DELETE FROM facts_progress WHERE owner = ?", args: [owner] });
    for (;;) {
      const result = await this.db.execute({ sql: "DELETE FROM facts WHERE id IN (SELECT id FROM facts WHERE owner = ? LIMIT 5000)", args: [owner] });
      if (result.rowsAffected === 0) return;
    }
  }
}

function toFact(r: Row): StoredFact {
  return {
    id: Number(r.id),
    conversation: String(r.conversation),
    subject: String(r.subject),
    predicate: String(r.predicate) as Predicate,
    object: String(r.object),
    messageId: Number(r.message_id),
    quoteStart: Number(r.quote_start),
    quoteEnd: Number(r.quote_end),
    quote: String(r.quote),
    validFrom: Number(r.valid_from),
    validTo: r.valid_to === null ? null : Number(r.valid_to),
    supersededBy: r.superseded_by === null ? null : Number(r.superseded_by),
  };
}
