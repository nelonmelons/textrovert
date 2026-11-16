import { analyzePortrait, loadPortraitSource, type WriteStory } from "../portrait/build";
import type { PortraitCache } from "../portrait/cache";
import { meaningfulTopics } from "../portrait/topics";
import type { Story } from "../portrait/types";
import type { ConversationStats, Insights, Person } from "../../convex/validators";
import { analyzeStoredConversations } from "../analyze";
import { buildInsights, buildPeople, type ConversationSummary } from "../insights";
import type { MessageStore, StoredMessage } from "../store";
import { normalizeName } from "../text";
import { LocalTime } from "../time";
import { ask, type ChatTurn, type ConversationRef } from "./agent";
import type { EpisodeIndex, StoredEpisode } from "./episodes";
import type { FactIndex, Predicate } from "./facts";

/** The Ask API's wire shapes, shared by the local server (scripts/ask-server.ts) and the hosted one (convex/http.ts). */

/** A message as the API shows it; attachments without text read "[photo]", "[video]" and so on. */
export interface ApiMessage {
  sender: string;
  fromMe: boolean;
  /** ISO 8601. */
  sentAt: string;
  text: string;
}

/** A message something was read from, with the chat it is in. */
export interface ApiSource extends ApiMessage {
  messageId: number;
  chat: string;
  chatId: string;
  /** True when the chat is the user's one-to-one DM with someone. */
  isDm: boolean;
}

export interface ApiCitation extends ApiSource {
  n: number;
  /** The exact span of text the answer relies on; `text` is the whole original message. */
  quote: string;
  /** Up to two messages right before and after the cited one in the same chat, oldest first. */
  before: ApiMessage[];
  after: ApiMessage[];
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
  const byId = new Map(options.conversations.map((c) => [c.id, c]));
  const citations = await Promise.all(
    out.citations.map(async (c): Promise<ApiCitation> => {
      const ref = byId.get(c.conversationId);
      const original = originals.get(c.messageId);
      const context = ref && original ? await contextAround(options.store, options.owner, ref, original) : { before: [], after: [] };
      return {
        n: c.n,
        messageId: c.messageId,
        sender: c.sender,
        fromMe: c.fromMe,
        chat: c.conversationTitle,
        chatId: c.conversationId,
        isDm: ref ? isDm(ref) : false,
        sentAt: new Date(c.ts).toISOString(),
        text: original?.text ?? c.quote,
        quote: c.quote,
        ...context,
      };
    }),
  );
  return { answer: out.answer, person: person ?? null, chats: scoped.length, citations };
}

const isDm = (ref: ConversationRef) => ref.kind === "dm" && ref.participants.length <= 2;

function toMessage(m: StoredMessage, ref: ConversationRef): ApiMessage {
  return {
    sender: m.sender,
    fromMe: !!ref.selfName && m.sender === ref.selfName,
    sentAt: new Date(m.ts).toISOString(),
    text: m.text ?? "[" + (m.kind === "text" ? "message" : m.kind) + "]",
  };
}

function toSource(m: StoredMessage, ref: ConversationRef): ApiSource {
  return { messageId: m.id, ...toMessage(m, ref), chat: ref.title, chatId: ref.id, isDm: isDm(ref) };
}

/** The two messages before and after one message in its chat, skipping system lines with no sender. */
export async function contextAround(store: MessageStore, owner: string, ref: ConversationRef, m: StoredMessage, n = 2): Promise<{ before: ApiMessage[]; after: ApiMessage[] }> {
  const window = await store.around(owner, ref.key, { ts: m.ts, id: m.id }, 2 * n + 5);
  const at = window.findIndex((x) => x.id === m.id);
  if (at < 0) return { before: [], after: [] };
  const real = (x: StoredMessage) => x.sender !== "";
  return {
    before: window.slice(0, at).filter(real).slice(-n).map((x) => toMessage(x, ref)),
    after: window.slice(at + 1).filter(real).slice(0, n).map((x) => toMessage(x, ref)),
  };
}

// ---------- friends, memoirs and the portrait ----------

/** What the friend, story and portrait routes read from. `writeStory` is null where no model key is configured. */
export interface FriendContext {
  conversations: ConversationRef[];
  owner: string;
  store: MessageStore;
  episodes: EpisodeIndex;
  facts: FactIndex;
  cache: PortraitCache;
  timeZone: string;
  writeStory: WriteStory | null;
}

export interface ApiFriendChat {
  id: string;
  title: string;
  platform: string;
  isDm: boolean;
  messageCount: number;
  /** ISO 8601. */
  lastAt: string;
}

export interface ApiFact {
  predicate: Predicate;
  object: string;
  /** The exact words in the source message the fact was read from. */
  quote: string;
  messageId: number;
  /** ISO 8601: when it became known, and when a later fact replaced it (null while it still holds). */
  validFrom: string;
  validTo: string | null;
  source: ApiSource;
}

export interface ApiPlan {
  what: string;
  /** YYYY-MM-DD when the chat pins the day down. */
  date: string | null;
  /** The timing as the chat said it. */
  when: string;
  who: string[];
  episodeId: number;
  source: ApiSource;
}

export interface ApiEpisode {
  id: number;
  title: string;
  summary: string;
  mood: string;
  kind: string;
  topics: string[];
  chatId: string;
  chat: string;
  isDm: boolean;
  /** ISO 8601. */
  start: string;
  end: string;
  messageCount: number;
  /** The episode's first message. */
  source: ApiSource;
}

export interface ApiStorySentence {
  /** Footnote number, counted through the whole memoir from 1. */
  n: number;
  text: string;
  /** Message ids backing the sentence, keys of ApiStory.sources: the model's validated picks, then the friend's fullest lines of a cited episode. */
  refs: number[];
  /** Episodes a footnote pointed at. */
  episodes: { id: number; title: string; summary: string }[];
}

export interface ApiStory {
  headline: string;
  chapters: { title: string; period: string; sentences: ApiStorySentence[] }[];
  sources: Record<string, ApiSource>;
  /** ISO 8601. */
  writtenAt: string;
}

export interface ApiFriend {
  person: ApiPerson;
  chats: ApiFriendChat[];
  /** The DM's conversation id, for /wrapped/<conversationId>; null without a DM. */
  dmConversationId: string | null;
  /** Things the chats say about them (likes, wants, works at, ...), current ones first, newest first. Health facts are never returned. */
  facts: ApiFact[];
  /** Plans with them from their episodes, newest first. */
  plans: ApiPlan[];
  /** Their most recent moments, newest first. */
  episodes: ApiEpisode[];
  /** What you talk about most, from their episodes, without generic tags. */
  topics: { topic: string; count: number }[];
  /** The cached memoir; null until GET /story has written one. */
  story: ApiStory | null;
  /** Texting numbers across your chats with them; null when nothing could be counted. */
  stats: ApiFriendStats | null;
}

const FRIEND_EPISODES = 400;
const SHOWN_EPISODES = 20;
const SHOWN_PLANS = 20;
const SHOWN_FACTS = 40;
const HIDDEN_PREDICATES: readonly string[] = ["health"];

function personNamed(conversations: ConversationRef[], name: string): ApiPerson {
  const want = name.trim().toLowerCase();
  const person = listPeople(conversations).find((p) => p.name.toLowerCase() === want);
  if (!person) throw new ApiError(404, "No one named " + JSON.stringify(name.trim()));
  return person;
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const iso = (ts: number) => new Date(ts).toISOString();

/** Everything the profile shows about one person, every item with the message it came from. */
// ---------- stats ----------

/** Stats keep timestamps as milliseconds since 1970, as the analyzer and Convex insights do. */
export type ApiStatsPerson = Omit<Person, "conversationKeys" | "aliases">;

/** GET /stats: the analyzer's profile insights over every chat, plus the people ranked by closeness. */
export interface ApiStats {
  insights: Insights;
  people: ApiStatsPerson[];
}

/** One friend's numbers: the merged person (all their chats) and, with a DM, that chat's own breakdown. */
export interface ApiFriendStats {
  person: ApiStatsPerson | null;
  dm: Pick<
    ConversationStats,
    "messages" | "myMessages" | "firstAt" | "lastAt" | "activeDays" | "longestStreakDays" | "sessions" | "hourly" | "weekday" | "monthly" | "topWords" | "topEmojis" | "links" | "calls"
  > & { myReplyMedianSec: number | null; theirReplyMedianSec: number | null; myInitiations: number; theirInitiations: number } | null;
}

const STATS_PEOPLE = 30;
const toStatsPerson = ({ conversationKeys: _keys, aliases: _aliases, ...p }: Person): ApiStatsPerson => p;

/** Runs pipeline/analyze.ts over the given chats and returns them as insights summaries. */
async function summarize(ctx: Pick<FriendContext, "owner" | "store" | "timeZone">, chats: ConversationRef[], now: number): Promise<ConversationSummary[]> {
  const byKey = new Map(chats.map((c) => [c.key, c]));
  const summaries: ConversationSummary[] = [];
  const targets = chats.map((c) => ({ key: c.key, kind: c.kind, selfName: c.selfName }));
  for await (const r of analyzeStoredConversations(ctx.store, ctx.owner, targets, new LocalTime(ctx.timeZone), now)) {
    const c = byKey.get(r.key)!;
    summaries.push({ key: c.key, platform: c.platform, kind: c.kind, title: c.title, selfName: c.selfName, closeness: r.closeness, stats: r.stats });
  }
  return summaries;
}

const statsRuns = new Map<string, { version: string; result: Promise<ApiStats> }>();

/** Overall stats, recomputed only when a new message lands or the chat list changes. */
export async function overallStats(ctx: Pick<FriendContext, "conversations" | "owner" | "store" | "timeZone">, now = Date.now()): Promise<ApiStats> {
  const version = (await ctx.store.latestId(ctx.owner)) + ":" + ctx.conversations.length;
  const run = statsRuns.get(ctx.owner);
  if (run?.version === version) return run.result;
  const result = summarize(ctx, ctx.conversations, now).then((summaries) => {
    const people = buildPeople(summaries);
    return { insights: buildInsights(summaries, people, now), people: people.slice(0, STATS_PEOPLE).map(toStatsPerson) };
  });
  statsRuns.set(ctx.owner, { version, result });
  result.catch(() => statsRuns.delete(ctx.owner));
  return result;
}

/** Analyzes just this friend's chats: cheap enough to run per profile. */
async function friendStats(ctx: FriendContext, person: ApiPerson, chats: ConversationRef[], dm: ConversationRef | null, now = Date.now()): Promise<ApiFriendStats | null> {
  const summaries = await summarize(ctx, chats, now);
  if (summaries.length === 0) return null;
  const want = normalizeName(person.name);
  const merged = buildPeople(summaries).find((p) => p.key === want || p.aliases.some((a) => a.toLowerCase() === person.name.toLowerCase())) ?? null;
  const s = dm ? summaries.find((x) => x.key === dm.key)?.stats ?? null : null;
  const me = s?.participants.find((p) => p.isMe);
  const them = s?.participants.filter((p) => !p.isMe) ?? [];
  return {
    person: merged ? toStatsPerson(merged) : null,
    dm: s
      ? {
          messages: s.messages,
          myMessages: s.myMessages,
          firstAt: s.firstAt,
          lastAt: s.lastAt,
          activeDays: s.activeDays,
          longestStreakDays: s.longestStreakDays,
          sessions: s.sessions,
          hourly: s.hourly,
          weekday: s.weekday,
          monthly: s.monthly,
          topWords: s.topWords.slice(0, 12),
          topEmojis: s.topEmojis.slice(0, 6),
          links: s.links,
          calls: s.calls,
          myReplyMedianSec: me?.replyMedianSec ?? null,
          theirReplyMedianSec: them[0]?.replyMedianSec ?? null,
          myInitiations: me?.initiations ?? 0,
          theirInitiations: them.reduce((n, p) => n + p.initiations, 0),
        }
      : null,
  };
}

export async function friendProfile(name: string, ctx: FriendContext): Promise<ApiFriend> {
  const { owner, store } = ctx;
  const person = personNamed(ctx.conversations, name);
  const chats = chatsWith(ctx.conversations, person.name);
  const refByKey = new Map(chats.map((c) => [c.key, c]));
  const dm = chats.find(isDm) ?? null;
  const groupKeys = chats.filter((c) => c !== dm).map((c) => c.key);
  const first = person.name.split(/\s+/)[0];
  const nameWords = new Set([first.toLowerCase(), ...words(person.name)]);

  const [dmEpisodes, groupEpisodes, factsByName, factsByFirst, cached, stats] = await Promise.all([
    dm ? ctx.episodes.find(owner, { conversations: [dm.key] }, FRIEND_EPISODES) : [],
    groupKeys.length ? ctx.episodes.find(owner, { conversations: groupKeys, person: person.name }, FRIEND_EPISODES) : [],
    ctx.facts.about(owner, person.name, { includeHistory: true, limit: 200 }),
    first.toLowerCase() !== person.name.toLowerCase() ? ctx.facts.about(owner, first, { includeHistory: true, limit: 200 }) : [],
    ctx.cache.story(owner, person.name),
    friendStats(ctx, person, chats, dm),
  ]);
  const episodes = [...dmEpisodes, ...groupEpisodes].sort((a, b) => b.startTs - a.startTs);

  const seenFacts = new Set<number>();
  const facts = [...factsByName, ...factsByFirst]
    .filter((f) => {
      if (seenFacts.has(f.id) || !refByKey.has(f.conversation) || HIDDEN_PREDICATES.includes(f.predicate)) return false;
      seenFacts.add(f.id);
      return words(f.subject).some((w) => nameWords.has(w));
    })
    .sort((a, b) => Number(a.validTo !== null) - Number(b.validTo !== null) || b.validFrom - a.validFrom)
    .slice(0, SHOWN_FACTS);

  const seenPlans = new Set<string>();
  const plans = episodes.flatMap((e) =>
    e.plans
      .filter((p) => {
        const key = p.what.toLowerCase().slice(0, 40);
        if (seenPlans.has(key) || !p.sources.length) return false;
        if (e.conversation !== dm?.key && !p.who.some((w) => words(w).some((x) => nameWords.has(x)))) return false;
        seenPlans.add(key);
        return true;
      })
      .map((p) => ({ plan: p, episode: e })),
  ).slice(0, SHOWN_PLANS);

  const counts = new Map<string, number>();
  for (const e of episodes) for (const t of e.topics) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1);
  const topics = meaningfulTopics([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
    .slice(0, 12)
    .map(([topic, count]) => ({ topic, count }));

  const shown = episodes.slice(0, SHOWN_EPISODES);
  const ids = [...facts.map((f) => f.messageId), ...plans.map((p) => p.plan.sources[0]), ...shown.map((e) => e.firstId)];
  const messages = new Map((await store.byIds(owner, [...new Set(ids)])).map((m) => [m.id, m]));
  const source = (id: number) => {
    const m = messages.get(id);
    const ref = m && refByKey.get(m.conversation);
    return m && ref ? toSource(m, ref) : null;
  };

  return {
    person,
    chats: chats.map((c) => ({ id: c.id, title: c.title, platform: c.platform, isDm: isDm(c), messageCount: c.messageCount, lastAt: iso(c.lastAt) })),
    dmConversationId: dm?.id ?? null,
    facts: facts.flatMap((f) => {
      const s = source(f.messageId);
      return s ? [{ predicate: f.predicate, object: f.object, quote: f.quote, messageId: f.messageId, validFrom: iso(f.validFrom), validTo: f.validTo === null ? null : iso(f.validTo), source: s }] : [];
    }),
    plans: plans.flatMap(({ plan, episode }) => {
      const s = source(plan.sources[0]);
      return s ? [{ what: plan.what, date: plan.date, when: plan.when, who: plan.who, episodeId: episode.id, source: s }] : [];
    }),
    episodes: shown.flatMap((e) => {
      const s = source(e.firstId);
      const ref = refByKey.get(e.conversation)!;
      return s
        ? [{ id: e.id, title: e.title, summary: e.summary, mood: e.mood, kind: e.kind, topics: e.topics, chatId: ref.id, chat: ref.title, isDm: isDm(ref), start: iso(e.startTs), end: iso(e.endTs), messageCount: e.messageCount, source: s }]
        : [];
    }),
    topics,
    story: cached ? await toApiStory(cached.story, cached.writtenAt, chats, ctx, episodes) : null,
    stats,
  };
}

async function toApiStory(story: Story, writtenAt: number, chats: ConversationRef[], ctx: FriendContext, episodes: StoredEpisode[]): Promise<ApiStory> {
  const refByKey = new Map(chats.map((c) => [c.key, c]));
  const ids = [...new Set(story.chapters.flatMap((c) => c.sentences.flatMap((s) => s.refs)))];
  const sources: Record<string, ApiSource> = {};
  for (const m of await ctx.store.byIds(ctx.owner, ids)) {
    const ref = refByKey.get(m.conversation);
    if (ref) sources[m.id] = toSource(m, ref);
  }
  const episodeById = new Map(episodes.map((e) => [e.id, e]));
  let n = 0;
  return {
    headline: story.headline,
    chapters: story.chapters.map((c) => ({
      title: c.title,
      period: c.period,
      sentences: c.sentences.map((s) => ({
        n: ++n,
        text: s.text,
        refs: s.refs.filter((id) => sources[id]),
        episodes: (s.episodes ?? []).flatMap((id) => {
          const e = episodeById.get(id);
          return e ? [{ id, title: e.title, summary: e.summary }] : [];
        }),
      })),
    })),
    sources,
    writtenAt: iso(writtenAt),
  };
}

const writing = new Map<string, Promise<Story | null>>();

/**
 * One person's "story of us": the cached memoir, or a new one written from their chats (the portrait's memoir writer
 * and footnote validation) and cached. `refresh` rewrites it. Returns null when there is too little to write about.
 */
export async function friendStory(name: string, ctx: FriendContext, refresh = false): Promise<{ story: ApiStory | null }> {
  const person = personNamed(ctx.conversations, name);
  const chats = chatsWith(ctx.conversations, person.name);
  const cached = refresh ? null : await ctx.cache.story(ctx.owner, person.name);
  const episodesOf = () => ctx.episodes.find(ctx.owner, { conversations: chats.map((c) => c.key) }, 1_000_000);
  if (cached) return { story: await toApiStory(cached.story, cached.writtenAt, chats, ctx, await episodesOf()) };
  const write = ctx.writeStory;
  if (!write) throw new ApiError(503, "Memoirs need a model key on the server");
  const key = ctx.owner + "\n" + person.name.toLowerCase();
  let job = writing.get(key);
  if (!job) {
    job = (async () => {
      const analysis = analyzePortrait(await loadPortraitSource(ctx.store, ctx.episodes, ctx.owner, chats, ctx.timeZone));
      const p = analysis.personNamed(person.name);
      const story = p ? await analysis.storyFor(p.id, write) : null;
      if (story) await ctx.cache.putStory(ctx.owner, person.name, story);
      return story;
    })().finally(() => writing.delete(key));
    writing.set(key, job);
  }
  const story = await job;
  return { story: story ? await toApiStory(story, Date.now(), chats, ctx, await episodesOf()) : null };
}

/** A JSON body that is already serialized, so a large cached document isn't parsed only to be stringified again. */
export class RawJson {
  constructor(readonly text: string) {}
}

/**
 * The whole portrait (packages/portrait's data), built from the store like scripts/build-portrait.ts with every cached
 * memoir, and cached until a new message, episode or memoir changes its version.
 */
export async function portraitJson(ctx: FriendContext): Promise<RawJson> {
  const [latest, indexed, stories] = await Promise.all([ctx.store.latestId(ctx.owner), ctx.episodes.indexedUpTo(ctx.owner), ctx.cache.stories(ctx.owner)]);
  const version = [latest, Math.max(0, ...indexed.values()), stories.newest, ctx.conversations.length].join(":");
  const cached = await ctx.cache.get(ctx.owner, "portrait");
  if (cached?.version === version) return new RawJson(cached.value);
  const analysis = analyzePortrait(await loadPortraitSource(ctx.store, ctx.episodes, ctx.owner, ctx.conversations, ctx.timeZone));
  const withIds = [...stories.byName].flatMap(([name, story]) => {
    const p = analysis.personNamed(name);
    return p ? [{ ...story, person: p.id }] : [];
  });
  const text = JSON.stringify(analysis.withStories(withIds));
  await ctx.cache.put(ctx.owner, "portrait", version, text);
  return new RawJson(text);
}

// ---------- reels ----------

/** A reel of one episode: rendered on a Mac running the local server; the hosted API answers "unavailable". */
export type ApiReel =
  | { status: "none"; episodeId: number }
  | { status: "rendering"; episodeId: number }
  | { status: "ready"; episodeId: number; /** Path on the API server, e.g. /reels/1652.mp4. */ url: string }
  | { status: "failed"; episodeId: number; error: string }
  | { status: "unavailable"; message: string };

export const REELS_ON_DESKTOP: ApiReel = { status: "unavailable", message: "Reels render on the desktop app. Open Textrovert on your Mac to make this one." };

/** Starts or reports reel renders; the hosted API has none. */
export interface ReelRenderer {
  status(episodeId: number): ApiReel;
  start(episodeId: number): ApiReel;
}

function episodeIdOf(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "episodeId must be a positive integer");
  return id;
}

/**
 * The friend, story, portrait and reel routes, shared by both servers:
 *   GET /friend?name=        → ApiFriend
 *   GET /story?name=&refresh=1 → {story: ApiStory | null}
 *   GET /portrait            → Portrait (packages/history/pipeline/portrait/types.ts)
 *   GET /stats               → ApiStats (pipeline/analyze.ts + pipeline/insights.ts over every chat)
 *   GET /reel?episodeId=     → ApiReel
 *   POST /reel {episodeId}   → ApiReel, starting a render when there is none
 * Returns null for any other route.
 */
export async function friendRoute(method: string, path: string, query: URLSearchParams, body: unknown, ctx: FriendContext, reels: ReelRenderer | null): Promise<unknown> {
  const name = () => query.get("name")?.trim() || (() => { throw new ApiError(400, "Pass ?name="); })();
  if (method === "GET" && path === "/friend") return friendProfile(name(), ctx);
  if (method === "GET" && path === "/story") return friendStory(name(), ctx, query.get("refresh") === "1");
  if (method === "GET" && path === "/portrait") return portraitJson(ctx);
  if (method === "GET" && path === "/stats") return overallStats(ctx);
  if (path === "/reel" && (method === "GET" || method === "POST")) {
    if (!reels) return REELS_ON_DESKTOP;
    if (method === "GET") return reels.status(episodeIdOf(query.get("episodeId")));
    return reels.start(episodeIdOf(body && typeof body === "object" ? (body as Record<string, unknown>).episodeId : undefined));
  }
  return null;
}
