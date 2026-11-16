/**
 * Typed client for the friend, story, portrait and reel routes (packages/history/pipeline/assistant/api.ts), served by
 * the local ask-server and the hosted Convex API alike. Shapes mirror the server's; dates are ISO 8601 strings.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

export interface ApiMessage {
  sender: string;
  fromMe: boolean;
  sentAt: string;
  /** Attachments without text read "[photo]", "[video]" and so on. */
  text: string;
}

/** The message an item was read from: open it to show the receipt. */
export interface ApiSource extends ApiMessage {
  messageId: number;
  chat: string;
  chatId: string;
  /** The user's one-to-one DM with someone (label it "Your DM"). */
  isDm: boolean;
}

/** What POST /ask citations now carry besides the existing fields: the chat kind and the messages around the cited one. */
export interface CitationContext {
  isDm: boolean;
  /** Up to two messages before and after the cited one, oldest first. */
  before: ApiMessage[];
  after: ApiMessage[];
}

export interface FriendPerson {
  name: string;
  dm: boolean;
  chats: number;
  messages: number;
  lastAt: string;
}

export interface FriendChat {
  id: string;
  title: string;
  platform: string;
  isDm: boolean;
  messageCount: number;
  lastAt: string;
}

export type FactPredicate = 'likes' | 'dislikes' | 'wants' | 'works at' | 'studies' | 'lives in' | 'relationship' | 'milestone' | 'habit';

export interface FriendFact {
  predicate: FactPredicate;
  object: string;
  /** The exact words in the source message. */
  quote: string;
  messageId: number;
  validFrom: string;
  /** Set when a later fact replaced this one. */
  validTo: string | null;
  source: ApiSource;
}

export interface FriendPlan {
  what: string;
  /** YYYY-MM-DD when the chat pins the day down. */
  date: string | null;
  /** The timing as the chat said it. */
  when: string;
  who: string[];
  episodeId: number;
  source: ApiSource;
}

export interface FriendEpisode {
  /** Pass to startReel/fetchReel. */
  id: number;
  title: string;
  summary: string;
  mood: string;
  kind: string;
  topics: string[];
  chatId: string;
  chat: string;
  isDm: boolean;
  start: string;
  end: string;
  messageCount: number;
  source: ApiSource;
}

export interface StorySentence {
  /** Footnote number, 1-based through the whole memoir. */
  n: number;
  text: string;
  /** Keys of Story.sources backing the sentence. */
  refs: number[];
  episodes: { id: number; title: string; summary: string }[];
}

export interface Story {
  headline: string;
  chapters: { title: string; period: string; sentences: StorySentence[] }[];
  sources: Record<string, ApiSource>;
  writtenAt: string;
}

export interface Friend {
  person: FriendPerson;
  chats: FriendChat[];
  /** For the Wrapped button: /wrapped/<dmConversationId>. */
  dmConversationId: string | null;
  facts: FriendFact[];
  plans: FriendPlan[];
  episodes: FriendEpisode[];
  topics: { topic: string; count: number }[];
  /** Null until fetchStory has written it once. */
  story: Story | null;
}

export type Reel =
  | { status: 'none'; episodeId: number }
  | { status: 'rendering'; episodeId: number }
  | { status: 'ready'; episodeId: number; url: string }
  | { status: 'failed'; episodeId: number; error: string }
  | { status: 'unavailable'; message: string };

export class FriendApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL + path, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), ...(API_KEY ? { 'x-api-key': API_KEY } : {}) },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new FriendApiError(body?.error || 'The server answered ' + res.status + '.', res.status);
    }
    return res;
  } catch (error) {
    if (error instanceof FriendApiError) throw error;
    throw new FriendApiError(controller.signal.aborted ? 'That took too long, so I stopped waiting.' : "Can't reach the server at " + API_URL + '.');
  } finally {
    clearTimeout(timer);
  }
}

const getJson = async <T>(path: string, timeoutMs = 20_000) => (await (await call(path, { method: 'GET' }, timeoutMs)).json()) as T;

/** Everything the profile shows about one person; 404 when no chat has that name. */
export const fetchFriend = (name: string) => getJson<Friend>('/friend?name=' + encodeURIComponent(name));

/** The "story of us": cached, or written on first call (10-30s). story is null when there's too little to write about. */
export const fetchStory = (name: string, refresh = false) =>
  getJson<{ story: Story | null }>('/story?name=' + encodeURIComponent(name) + (refresh ? '&refresh=1' : ''), 120_000).then((r) => r.story);

/** The portrait data as text, ready for PortraitWebView (it can be a few megabytes, so it isn't parsed here). */
export const fetchPortraitJson = async () => (await call('/portrait', { method: 'GET' }, 120_000)).text();

export const fetchReel = (episodeId: number) => getJson<Reel>('/reel?episodeId=' + episodeId);

/** Starts rendering a reel (about a minute on a Mac); poll fetchReel until it is ready, failed or unavailable. */
export const startReel = async (episodeId: number) =>
  (await (await call('/reel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ episodeId }) }, 20_000)).json()) as Reel;

/** The playable URL of a ready reel, for expo-video. */
export const reelUrl = (reel: Extract<Reel, { status: 'ready' }>) => API_URL + reel.url;
