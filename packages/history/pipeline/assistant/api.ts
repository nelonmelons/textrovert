import type { MessageStore } from "../store";
import { ask, type ChatTurn, type ConversationRef } from "./agent";

/** The Ask API's wire shapes, shared by the local server (scripts/ask-server.ts) and the hosted one (convex/http.ts). */
export interface ApiCitation {
  n: number;
  messageId: number;
  sender: string;
  fromMe: boolean;
  chat: string;
  chatId: string;
  /** ISO 8601. */
  sentAt: string;
  /** The whole original message. */
  text: string;
  /** The exact span of text the answer relies on. */
  quote: string;
}

export interface ApiAnswer {
  answer: string;
  person: string | null;
  chats: number;
  citations: ApiCitation[];
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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
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

/** Everyone in the chats except the user, people with a DM first by DM volume, then by messages in shared chats. */
export function listPeople(conversations: ConversationRef[]): ApiPerson[] {
  const selfNames = new Set(conversations.map((c) => c.selfName).filter((s): s is string => !!s));
  const byName = new Map<string, Omit<ApiPerson, "lastAt"> & { lastAt: number; dmMessages: number }>();
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
  return [...byName.values()]
    .sort((a, b) => b.dmMessages - a.dmMessages || b.messages - a.messages)
    .map(({ dmMessages: _, ...p }) => ({ ...p, lastAt: new Date(p.lastAt).toISOString() }));
}

/** The chats a person is in (their DM and shared groups), matched case-insensitively by display name. */
export function chatsWith(conversations: ConversationRef[], person: string): ConversationRef[] {
  const want = person.toLowerCase();
  return conversations.filter((c) => c.participants.some((p) => p.toLowerCase() === want));
}

/**
 * Runs the assistant for one API request, scoped to the person's chats when one is given, and maps its citations to
 * the wire shape with each cited message's full text.
 */
export async function answerRequest(
  request: AskRequest,
  options: Omit<Parameters<typeof ask>[0], "question" | "history" | "conversations" | "store"> & { conversations: ConversationRef[]; store: MessageStore },
): Promise<ApiAnswer> {
  const { question, person, history } = request;
  const scoped = person ? chatsWith(options.conversations, person) : options.conversations;
  if (person && scoped.length === 0) throw new ApiError(404, "No chats with " + person);
  const out = await ask({ ...options, question: person ? `About ${person}: ${question}` : question, history, conversations: scoped });
  const originals = new Map((await options.store.byIds(options.owner, out.citations.map((c) => c.messageId))).map((m) => [m.id, m]));
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
