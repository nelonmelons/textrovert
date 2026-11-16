/**
 * Typed client for the Textrovert API: local (packages/history/scripts/ask-server.ts) or hosted
 * (packages/history/convex/http.ts). Screens don't call it directly when they can show fixtures instead; they go
 * through useDataMode() and the hooks in ./people, so the app still works with no backend.
 */

/** Unset means no backend: the app runs on Emma's fixtures. Inlined when the bundle is built. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
/** Sent as x-api-key; the hosted API requires it. It ships inside the app bundle, so it gates casual use, not a determined one. */
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

/** A message something was read from, with the chat it is in. */
export interface Source {
  messageId: number;
  sender: string;
  fromMe: boolean;
  chat: string;
  chatId: string;
  /** ISO 8601. */
  sentAt: string;
  /** The whole original message. */
  text: string;
}

export interface Citation extends Source {
  n: number;
  /** The exact span of text the answer relies on. */
  quote: string;
}

export interface AskResult {
  answer: string;
  person: string | null;
  chats: number;
  citations: Citation[];
}

export interface Person {
  name: string;
  dm: boolean;
  chats: number;
  messages: number;
  /** ISO 8601. */
  lastAt: string;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * GET /friend?name= (being added on nelson/app-friends; this mirrors its ApiFriend, check it when that lands).
 * TODO(app-friends): fill the profile's "From your chats" card (LiveSections in app/friend/[id].tsx) from this.
 */
export interface FriendProfile {
  person: Person;
  chats: { id: string; title: string; platform: string; isDm: boolean; messageCount: number; lastAt: string }[];
  /** The DM's conversation id, for /wrapped/<conversationId>; null without a DM. */
  dmConversationId: string | null;
  facts: { predicate: string; object: string; quote: string; messageId: number; validFrom: string; validTo: string | null; source: Source }[];
  plans: { what: string; date: string | null; when: string; who: string[]; episodeId: number; source: Source }[];
  episodes: { id: number; title: string; summary: string; mood: string; start: string; end: string; source: Source }[];
  topics: { topic: string; count: number }[];
  story: Story | null;
}

/** A friend's memoir from GET /story?name=, footnoted with message ids that key into sources. */
export interface Story {
  headline: string;
  chapters: { title: string; period: string; sentences: { n: number; text: string; refs: number[] }[] }[];
  sources: Record<string, Source>;
  writtenAt: string;
}

/** Answers routinely take 15-30s while the assistant searches and reads; give it room. */
const ASK_TIMEOUT_MS = 120_000;
const READ_TIMEOUT_MS = 15_000;

export class ApiError extends Error {}

async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  if (!API_URL) throw new ApiError('No API is set up. Set EXPO_PUBLIC_API_URL to use your own chats.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), ...(API_KEY ? { 'x-api-key': API_KEY } : {}) },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? 'That took longer than ' + Math.round(timeoutMs / 1000) + 's, so I stopped waiting. Try a narrower question.'
        : "Can't reach the Ask server at " + API_URL + '. Is it running?',
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new ApiError(body?.error || 'The Ask server answered ' + res.status + '.');
  return body;
}

const get = <T>(path: string) => request<T>(path, { method: 'GET' }, READ_TIMEOUT_MS);
const post = <T>(path: string, body: unknown, timeoutMs = READ_TIMEOUT_MS) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs);

/** POST /ask: an answer from your chats, scoped to one person or all of them, with numbered citations. */
export const ask = (question: string, person: string | null, history: Turn[]) =>
  post<AskResult>('/ask', { question, person: person ?? undefined, history }, ASK_TIMEOUT_MS);

/** GET /people: everyone you text, most-messaged DMs first. */
export const fetchPeople = () => get<{ people: Person[] }>('/people').then((r) => r.people);

/** GET /friend?name=. TODO(app-friends): not on main yet; 404s until nelson/app-friends lands. */
export const fetchFriend = (name: string) => get<FriendProfile>('/friend?name=' + encodeURIComponent(name));

/** GET /story?name=. TODO(app-friends): the memoir for the profile's story section. */
export const fetchStory = (name: string, refresh = false) =>
  get<{ story: Story | null }>('/story?name=' + encodeURIComponent(name) + (refresh ? '&refresh=1' : '')).then((r) => r.story);

/** GET /portrait: packages/portrait's data. TODO(app-friends): typed once the portrait types move into a shared package. */
export const fetchPortrait = () => get<unknown>('/portrait');

/**
 * POST /wrapped {conversationId, from?, through?}: one Wrapped edition for a DM (packages/wrapped's WrappedOutcome).
 * TODO(app-wrapped): src/features/wrapped/ owns the response type and the screen behind /wrapped/[conversationId].
 */
export const fetchWrapped = (body: { conversationId: string; from?: string; through?: string }) =>
  post<unknown>('/wrapped', body, ASK_TIMEOUT_MS);

export const senderLabel = (c: Pick<Citation, 'fromMe' | 'sender'>) => (c.fromMe ? 'You' : c.sender || 'Someone');
