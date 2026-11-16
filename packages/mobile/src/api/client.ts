/**
 * The one place the Textrovert API is configured: base URL, key, timeouts and errors. Routes live in ./ask (via this
 * file) and ./friend; both servers (packages/history/scripts/ask-server.ts locally, convex/http.ts hosted) answer
 * them alike. Screens choose between it and Emma's fixtures with useDataMode(), so the app works with no backend.
 */

import { loadOwnerKey } from './owner';

/** Unset means no backend: the app runs on Emma's fixtures. Inlined when the bundle is built. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
/** Sent as x-api-key; the hosted API requires it. It ships inside the app bundle, so it gates casual use, not a determined one. */
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** One request with the key, a timeout and readable errors; resolves to the raw response, already checked for 2xx. */
export async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (!API_URL) throw new ApiError('No API is set up. Set EXPO_PUBLIC_API_URL to use your own chats.');
  const ownerKey = await loadOwnerKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
        ...(ownerKey ? { 'x-owner-key': ownerKey } : {}),
      },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted ? 'That took longer than ' + Math.round(timeoutMs / 1000) + 's, so I stopped waiting.' : "Can't reach the server at " + API_URL + '. Is it running?',
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error || 'The server answered ' + res.status + '.', res.status);
  }
  return res;
}

export const READ_TIMEOUT_MS = 20_000;
/** Answers and memoirs routinely take 15-30s while the assistant reads; give them room. */
export const SLOW_TIMEOUT_MS = 120_000;

export const getJson = async <T>(path: string, timeoutMs = READ_TIMEOUT_MS) => (await (await call(path, { method: 'GET' }, timeoutMs)).json()) as T;
export const postJson = async <T>(path: string, body: unknown, timeoutMs = READ_TIMEOUT_MS) =>
  (await (await call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs)).json()) as T;

export interface ApiMessage {
  sender: string;
  fromMe: boolean;
  /** ISO 8601. */
  sentAt: string;
  /** Attachments without text read "[photo]", "[video]" and so on. */
  text: string;
}

/** The message something was read from: open it to show the receipt. */
export interface Source extends ApiMessage {
  messageId: number;
  chat: string;
  chatId: string;
  /** The user's one-to-one DM with someone (label it "Your DM"). Missing from older servers. */
  isDm?: boolean;
}

export interface Citation extends Source {
  n: number;
  /** The exact span of text the answer relies on; text is the whole message. */
  quote: string;
  /** Up to two messages right before and after the cited one, oldest first. Missing from older servers. */
  before?: ApiMessage[];
  after?: ApiMessage[];
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

/** POST /ask: an answer from your chats, scoped to one person or all of them, with numbered citations. */
export const ask = (question: string, person: string | null, history: Turn[]) => postJson<AskResult>('/ask', { question, person: person ?? undefined, history }, SLOW_TIMEOUT_MS);

/** GET /people: everyone you text, most-messaged DMs first. */
export const fetchPeople = () => getJson<{ people: Person[] }>('/people').then((r) => r.people);

export const senderLabel = (c: Pick<ApiMessage, 'fromMe' | 'sender'>) => (c.fromMe ? 'You' : c.sender || 'Someone');
/** "Your DM" for the one-to-one chat, else the chat's name. */
export const chatLabel = (s: Pick<Source, 'chat' | 'isDm'>) => (s.isDm ? 'Your DM' : s.chat);
