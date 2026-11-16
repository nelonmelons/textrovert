/**
 * The friend, story, portrait, reel and Wrapped routes (packages/history/pipeline/assistant/api.ts). Configuration,
 * keys and errors come from ./client. Shapes mirror the server's; dates are ISO 8601 strings.
 */
import { API_URL, call, getJson, postJson, SLOW_TIMEOUT_MS, type Person, type Source } from './client';

export type FactPredicate = 'likes' | 'dislikes' | 'wants' | 'works at' | 'studies' | 'lives in' | 'relationship' | 'milestone' | 'habit';

export interface FriendChat {
  id: string;
  title: string;
  platform: string;
  isDm: boolean;
  messageCount: number;
  lastAt: string;
}

export interface FriendFact {
  predicate: FactPredicate;
  object: string;
  /** The exact words in the source message. */
  quote: string;
  messageId: number;
  validFrom: string;
  /** Set when a later fact replaced this one. */
  validTo: string | null;
  source: Source;
}

export interface FriendPlan {
  what: string;
  /** YYYY-MM-DD when the chat pins the day down. */
  date: string | null;
  /** The timing as the chat said it. */
  when: string;
  who: string[];
  episodeId: number;
  source: Source;
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
  source: Source;
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
  sources: Record<string, Source>;
  writtenAt: string;
}

/** GET /friend: everything the profile shows about one person. */
export interface FriendProfile {
  person: Person;
  chats: FriendChat[];
  /** For the Wrapped button: /wrapped/<dmConversationId>; null without a DM. */
  dmConversationId: string | null;
  facts: FriendFact[];
  plans: FriendPlan[];
  episodes: FriendEpisode[];
  topics: { topic: string; count: number }[];
  /** Null until fetchStory has written it once. */
  story: Story | null;
  /** Texting numbers across your chats with them (pipeline/analyze.ts); null when nothing could be counted. */
  stats: FriendStats | null;
}

type TextCount = { text: string; count: number };

/** A person as the analyzer ranks them. Times are milliseconds since 1970. */
export interface StatsPerson {
  key: string;
  name: string;
  platforms: string[];
  messages: number;
  fromThem: number;
  fromMe: number;
  dmMessages: number;
  firstAt: number | null;
  lastAt: number | null;
  theirReplyMedianSec: number | null;
  myReplyMedianSec: number | null;
  initiatedByMe: number;
  initiatedByThem: number;
  /** 0-100 from volume, balance, recency and consistency. */
  closeness: number;
}

export interface FriendStats {
  person: StatsPerson | null;
  /** The DM's own breakdown; null without a DM. hourly has 24 entries, weekday 7 (Sunday first). */
  dm: {
    messages: number;
    myMessages: number;
    firstAt: number | null;
    lastAt: number | null;
    activeDays: number;
    longestStreakDays: number;
    sessions: number;
    hourly: number[];
    weekday: number[];
    monthly: { month: string; mine: number; theirs: number }[];
    topWords: TextCount[];
    topEmojis: TextCount[];
    links: number;
    calls: number;
    myReplyMedianSec: number | null;
    theirReplyMedianSec: number | null;
    myInitiations: number;
    theirInitiations: number;
  } | null;
}

/** GET /stats: buildInsights over every chat (the numbers Convex keeps per profile) and the closest people. */
export interface Stats {
  insights: {
    generatedAt: number;
    totals: { messages: number; sent: number; received: number; conversations: number; dms: number; groups: number; aiChats: number; people: number; firstAt: number | null; lastAt: number | null };
    platforms: { platform: string; conversations: number; messages: number; sent: number }[];
    /** Your messages by weekday * 24 + hour, Sunday first. */
    heatmap: number[];
    monthly: { month: string; sent: number; received: number }[];
    reply: { myMedianSec: number | null; theirMedianSec: number | null; myHistogram: number[]; theirHistogram: number[] };
    habits: {
      initiationRate: number | null;
      doubleTextRate: number | null;
      nightOwlRate: number | null;
      avgWordsPerMessage: number | null;
      laughRate: number | null;
      questionRate: number | null;
      emojiRate: number | null;
    };
    topEmojis: TextCount[];
    topWords: TextCount[];
    topPeople: { key: string; name: string; closeness: number; messages: number; platforms: string[] }[];
    archetypes: { id: string; label: string; reason: string }[];
  };
  people: StatsPerson[];
}

export type Reel =
  | { status: 'none'; episodeId: number }
  | { status: 'rendering'; episodeId: number }
  | { status: 'ready'; episodeId: number; url: string }
  | { status: 'failed'; episodeId: number; error: string }
  | { status: 'unavailable'; message: string };

/** Everything the profile shows about one person; 404 when no chat has that name. */
export const fetchFriend = (name: string) => getJson<FriendProfile>('/friend?name=' + encodeURIComponent(name));

/** The "story of us": cached, or written on first call (10-30s). Null when there's too little to write about. */
export const fetchStory = (name: string, refresh = false) =>
  getJson<{ story: Story | null }>('/story?name=' + encodeURIComponent(name) + (refresh ? '&refresh=1' : ''), SLOW_TIMEOUT_MS).then((r) => r.story);

/** The portrait data as text, ready for PortraitWebView (it can be a few megabytes, so it isn't parsed here). */
export const fetchPortraitJson = async () => (await call('/portrait', { method: 'GET' }, SLOW_TIMEOUT_MS)).text();

/** Overall texting stats; the first call after new messages analyzes every chat (a few seconds). */
export const fetchStats = () => getJson<Stats>('/stats', SLOW_TIMEOUT_MS);

export const fetchReel = (episodeId: number) => getJson<Reel>('/reel?episodeId=' + episodeId);

/** Starts rendering a reel (about a minute on a Mac); poll fetchReel until it is ready, failed or unavailable. */
export const startReel = (episodeId: number) => postJson<Reel>('/reel', { episodeId });

/** The playable URL of a ready reel, for expo-video. */
export const reelUrl = (reel: Extract<Reel, { status: 'ready' }>) => API_URL + reel.url;

/**
 * POST /wrapped {conversationId, from?, through?}: one Wrapped edition for a DM (packages/wrapped's WrappedOutcome).
 * TODO(app-wrapped): src/features/wrapped/ owns the response type and the screen behind /wrapped/[conversationId].
 */
export const fetchWrapped = (body: { conversationId: string; from?: string; through?: string }) => postJson<unknown>('/wrapped', body, SLOW_TIMEOUT_MS);
