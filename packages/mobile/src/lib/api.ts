/** Client for the Ask API: local (packages/history/scripts/ask-server.ts) or hosted (packages/history/convex/http.ts). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
/** Sent as x-api-key; the hosted API requires it. It ships inside the app bundle, so it gates casual use, not a determined one. */
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

export interface Citation {
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
  lastAt: string;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** Answers routinely take 15-30s while the assistant searches and reads; give it room. */
const ASK_TIMEOUT_MS = 120_000;

export class ApiError extends Error {}

export async function request<T>(path: string, init: RequestInit, timeoutMs: number, timeoutMessage?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), ...(API_KEY ? { 'x-api-key': API_KEY } : {}) },
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError(
      controller.signal.aborted
        ? (timeoutMessage ?? 'That took longer than ' + Math.round(timeoutMs / 1000) + 's, so I stopped waiting. Try a narrower question.')
        : "Can't reach the Ask server at " + API_URL + '. Is it running?',
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new ApiError(body?.error || 'The Ask server answered ' + res.status + '.');
  return body;
}

export const ask = (question: string, person: string | null, history: Turn[]) =>
  request<AskResult>(
    '/ask',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, person: person ?? undefined, history }) },
    ASK_TIMEOUT_MS,
  );

export const fetchPeople = () => request<{ people: Person[] }>('/people', { method: 'GET' }, 15_000).then((r) => r.people);

export const senderLabel = (c: Pick<Citation, 'fromMe' | 'sender'>) => (c.fromMe ? 'You' : c.sender || 'Someone');
