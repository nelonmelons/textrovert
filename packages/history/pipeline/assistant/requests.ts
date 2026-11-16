import type { ChatTurn, ConversationRef } from "./agent";

/**
 * Request parsing and the people list for the hosted API (convex/http.ts), split out of api.ts and wrappedApi.ts so the
 * HTTP router's bundle stays free of Node-only code (the store, archives and the portrait builder). api.ts and
 * wrappedApi.ts re-export everything here, so the local ask-server is unchanged.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiPerson {
  name: string;
  dm: boolean;
  chats: number;
  messages: number;
  /** ISO 8601. */
  lastAt: string;
}

export interface AskRequest {
  question: string;
  person?: string;
  history?: ChatTurn[];
}

/** Validates a POST /ask body: a non-empty question, an optional person, and the earlier turns of the chat. */
export function parseAskRequest(body: unknown): AskRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Body must be a JSON object");
  const b = body as Record<string, unknown>;
  const question = typeof b.question === "string" ? b.question.trim().slice(0, 2000) : "";
  if (!question) throw new ApiError(400, "Ask a question");
  const person = typeof b.person === "string" && b.person.trim() ? b.person.trim().slice(0, 200) : undefined;
  const history = Array.isArray(b.history)
    ? b.history
        .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .slice(-20)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }))
    : undefined;
  return { question, person, history };
}

/**
 * Names that are really pieces of imessage-exporter's text, not people: "(Read by you after 2 minutes)" split into
 * "you after 2 minutes)" and "May 17, 2024  5:35:00 PM (Read" by Mac apps before the threaded-reply fix. Chats
 * uploaded before that fix still carry them as participants, so every list of people drops them by name.
 */
export function isJunkName(name: string): boolean {
  const n = name.trim();
  return (
    !n ||
    /\bafter (?:\d+|an?|one) (?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/i.test(n) ||
    /\(Read\b|\bRead by\b/i.test(n) ||
    /^you\b.*\)$/i.test(n) ||
    /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/.test(n)
  );
}

/**
 * Everyone in the chats except the user and business senders (Apple's "urn:biz:" handles), people with a DM first by
 * DM volume, then by messages in shared chats.
 */
export function listPeople(conversations: ConversationRef[]): ApiPerson[] {
  const selfNames = new Set(conversations.map((c) => c.selfName).filter((s): s is string => !!s));
  const byName = new Map<string, Omit<ApiPerson, "lastAt"> & { lastAt: number; dmMessages: number }>();
  for (const c of conversations) {
    for (const name of c.participants) {
      if (selfNames.has(name) || name === "Instagram User" || name.startsWith("urn:biz:") || isJunkName(name)) continue;
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
  return [...byName.values()]
    .sort((a, b) => b.dmMessages - a.dmMessages || b.messages - a.messages)
    .map(({ dmMessages: _, ...p }) => ({ ...p, lastAt: new Date(p.lastAt).toISOString() }));
}

export interface WrappedApiRequest {
  conversationId: string;
  /** YYYY-MM-DD, both or neither; without them the range is the 30 days ending on the chat's last message. */
  from?: string;
  through?: string;
  avoiding: string[];
  number: number;
  model: boolean;
  includeWarmMoments: boolean;
  allowAffectionateTeasing: boolean;
  timeoutMs?: number;
  debug: boolean;
}

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseWrappedRequest(body: unknown): WrappedApiRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Body must be a JSON object");
  const b = body as Record<string, unknown>;
  const conversationId = typeof b.conversationId === "string" ? b.conversationId : "";
  if (!conversationId) throw new ApiError(400, "conversationId is required");
  const hasRange = b.from !== undefined || b.through !== undefined;
  if (hasRange && (!isDay(b.from) || !isDay(b.through))) throw new ApiError(400, "from and through must both be YYYY-MM-DD dates");
  return {
    conversationId,
    ...(hasRange ? { from: b.from as string, through: b.through as string } : {}),
    avoiding: Array.isArray(b.avoiding) ? b.avoiding.filter((x): x is string => typeof x === "string").slice(0, 5000) : [],
    number: typeof b.number === "number" && b.number >= 1 ? Math.floor(b.number) : 1,
    model: b.model !== false,
    includeWarmMoments: b.includeWarmMoments === true,
    allowAffectionateTeasing: b.allowAffectionateTeasing === true,
    timeoutMs: typeof b.timeoutMs === "number" && b.timeoutMs > 0 ? Math.min(b.timeoutMs, 120_000) : undefined,
    debug: b.debug === true,
  };
}
