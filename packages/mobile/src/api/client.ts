/**
 * The one place the Textrovert API is configured: base URL, key, timeouts and errors. Routes live in ./ask (via this
 * file) and ./friend; both servers (packages/history/scripts/ask-server.ts locally, convex/http.ts hosted) answer
 * them alike. Screens choose between it and Emma's fixtures with useDataMode(), so the app works with no backend.
 */

/** A server and the key sent to it as x-api-key; the hosted API requires the key. */
export interface Connection {
  url: string;
  key: string;
}

/** "my-app.convex.site/" becomes "https://my-app.convex.site". */
export function normalizeUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, '');
  return !trimmed || /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
}

/** The server inlined at build time from EXPO_PUBLIC_API_URL and EXPO_PUBLIC_API_KEY; an empty url means Emma's fixtures. */
export const BUILT_IN: Connection = { url: normalizeUrl(process.env.EXPO_PUBLIC_API_URL ?? ''), key: process.env.EXPO_PUBLIC_API_KEY || '' };

let connection = BUILT_IN;

/** Points every request at another server: mode.tsx calls it on launch and when you sign in or out. */
export function setConnection(next: Connection) {
  connection = next;
}

export const apiUrl = () => connection.url;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** One request with the key, a timeout and readable errors; resolves to the raw response, already checked for 2xx. */
export async function call(path: string, init: RequestInit, timeoutMs: number, using = connection): Promise<Response> {
  if (!using.url) throw new ApiError('Not signed in. Sign in to use your own chats.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(using.url + path, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), ...(using.key ? { 'x-api-key': using.key } : {}) },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted ? 'That took longer than ' + Math.round(timeoutMs / 1000) + 's, so I stopped waiting.' : "Can't reach the server at " + using.url + '. Is it running?',
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

/** GET /people: everyone you text, most-messaged DMs first. Pass a connection to try one before signing in to it. */
export async function fetchPeople(using = connection): Promise<Person[]> {
  const body = (await (await call('/people', { method: 'GET' }, READ_TIMEOUT_MS, using)).json().catch(() => null)) as { people?: Person[] } | null;
  if (!Array.isArray(body?.people)) throw new ApiError("That address isn't a Textrovert server.");
  return body.people;
}

export const senderLabel = (c: Pick<ApiMessage, 'fromMe' | 'sender'>) => (c.fromMe ? 'You' : c.sender || 'Someone');
/** "Your DM" for the one-to-one chat, else the chat's name. */
export const chatLabel = (s: Pick<Source, 'chat' | 'isDm'>) => (s.isDm ? 'Your DM' : s.chat);
