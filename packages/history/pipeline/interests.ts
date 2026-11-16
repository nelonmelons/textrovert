import { mapLimit, type Llm } from "./llm";
import type { MessageStore, TextSource } from "./store";
import { isTopWordCandidate, normalizeName } from "./text";
import type { ConversationKind } from "./types";

export const INTEREST_CATEGORIES = [
  "sports",
  "fitness",
  "outdoors",
  "music",
  "film & tv",
  "books & podcasts",
  "games",
  "food & drink",
  "travel & places",
  "arts & crafts",
  "tech",
  "learning",
  "pets & animals",
  "style",
  "events & nightlife",
  "school & work",
  "community",
  "other",
] as const;
export type InterestCategory = (typeof INTEREST_CATEGORIES)[number];

export interface Interest {
  /** Unique within one profile ("i1", "i2", ...); comparisons refer to interests by it. */
  id: string;
  name: string;
  category: InterestCategory;
  /** How it shows up for the person, as a phrase with no subject: "boulders at Mission Cliffs most weeks". */
  summary: string;
  /** Concrete things the person names: teams, artists, titles, venues, places. */
  specifics: string[];
  /** Search terms that find the person's messages about it. */
  keywords: string[];
  /** Messages the person wrote, across their whole history, that mention it. */
  mentions: number;
  firstAt: number | null;
  lastAt: number | null;
}

export interface InterestProfile {
  interests: Interest[];
  /** Messages the person wrote that are long enough to say something. */
  messages: number;
  /** How many of those the model read: all of them, unless the history is bigger than the reading budget. */
  read: number;
}

/** One of the user's chats, as the interest builder needs it. */
export interface ChatSource {
  key: string;
  kind: ConversationKind;
  selfName: string | null;
  /** Sender names (or handles) seen in the chat. */
  participants: string[];
}

export interface OwnMessage {
  ts: number;
  text: string;
}

/** Shorter texts ("ok", "lol", "omw") say nothing about what someone is into. */
const MIN_LETTERS = 10;
const MIN_MESSAGES = 5;
const MAX_MESSAGE_CHARS = 500;
/** Roughly 400k tokens of one person's own writing. Bigger histories are sampled evenly across time. */
export const READ_BUDGET_CHARS = 1_600_000;
/** Part of the reading budget that goes to topics that keep coming up, but rarely (see focusMessages). */
const FOCUS_SHARE = 0.25;
/** Words in more than this share of someone's messages are everyday vocabulary, which the even sample covers anyway. */
const TOPIC_MAX_SHARE = 0.005;
/** Messages read per topic word, spread across time. */
const PER_TOPIC = 6;
const CHUNK_CHARS = 45_000;
const CONCURRENCY = 8;
/** An interest has to show up in at least this many of the person's messages to make the profile. */
const MIN_MENTIONS = 3;
const MAX_INTERESTS = 60;
const MAX_CANDIDATES = 250;

const URL_RE = /\bhttps?:\/\/([^\s/?#]+)\S*|\bwww\.([^\s/?#]+)\S*/gi;
const LETTER_RE = /\p{L}/gu;
const WORD_RE = /[\p{L}\p{N}]+/gu;

/** The user's chats with people (not AI assistants) in which we know which sender is the user. */
export function peopleChats(chats: ChatSource[]): TextSource[] {
  return chats.flatMap((c) => (c.kind !== "ai" && c.selfName ? [{ key: c.key, selfName: c.selfName }] : []));
}

/** Every text the user sent in their chats with people, oldest first. */
export async function loadOwnMessages(store: MessageStore, owner: string, chats: ChatSource[]): Promise<OwnMessage[]> {
  const messages: OwnMessage[] = [];
  for await (const page of store.texts(owner, peopleChats(chats), "self", MIN_LETTERS)) {
    for (const row of page) messages.push({ ts: row.ts, text: row.text });
  }
  return messages.sort((a, b) => a.ts - b.ts);
}

/** Drops texts too short to say anything, shortens links to their site, and caps length. */
export function substantiveMessages(messages: OwnMessage[]): OwnMessage[] {
  const kept: OwnMessage[] = [];
  for (const m of messages) {
    if ((m.text.replace(URL_RE, " ").match(LETTER_RE)?.length ?? 0) < MIN_LETTERS) continue;
    const text = m.text
      .replace(URL_RE, (_match, host?: string, wwwHost?: string) => "[link " + (host ?? wwwHost ?? "").replace(/^www\./, "") + "]")
      .replace(/\s+/g, " ")
      .trim();
    kept.push({ ts: m.ts, text: text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) + "…" : text });
  }
  return kept;
}

/** The first occurrence of each distinct text: the model only needs to read "omw!" or a repeated plan once. */
export function distinctMessages(messages: OwnMessage[]): OwnMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const key = m.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Messages about topics that keep coming up, but rarely: words the person used in at least MIN_MENTIONS messages,
 * yet in too few for an even sample to catch. A few messages per word, spread across time, are grouped together, so a
 * hobby that comes up 40 times in 60,000 texts reaches the model as a cluster instead of one line among hundreds of
 * small talk. Words that come up in more messages go first.
 */
export function focusMessages(messages: OwnMessage[], budgetChars: number): OwnMessage[] {
  const byWord = new Map<string, number[]>();
  messages.forEach((m, i) => {
    for (const word of new Set(fold(m.text).match(WORD_RE))) {
      if (!isTopWordCandidate(word)) continue;
      const found = byWord.get(word);
      if (found) found.push(i);
      else byWord.set(word, [i]);
    }
  });
  const maxMessages = Math.floor(messages.length * TOPIC_MAX_SHARE);
  const topics = [...byWord.entries()]
    .filter(([, found]) => found.length >= MIN_MENTIONS && found.length <= maxMessages)
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  const taken = new Set<number>();
  const focus: OwnMessage[] = [];
  let size = 0;
  for (const [, found] of topics) {
    const count = Math.min(PER_TOPIC, found.length);
    for (let k = 0; k < count; k++) {
      const i = found[Math.floor(((k + 0.5) * found.length) / count)];
      if (taken.has(i)) continue;
      if (size + lineChars(messages[i]) > budgetChars) return focus;
      taken.add(i);
      focus.push(messages[i]);
      size += lineChars(messages[i]);
    }
  }
  return focus;
}

/** All messages when they fit the budget; otherwise an even, deterministic sample across the whole history. */
export function selectWithinBudget(messages: OwnMessage[], budgetChars: number): OwnMessage[] {
  const total = messages.reduce((sum, m) => sum + lineChars(m), 0);
  if (total <= budgetChars) return messages;
  const share = budgetChars / total;
  return messages.filter((m) => unitHash(m.ts + "|" + m.text) < share);
}

/** Lines of "YYYY-MM text", grouped into model-sized chunks. */
export function chunkMessages(messages: OwnMessage[], chunkChars: number): string[] {
  const chunks: string[] = [];
  let lines: string[] = [];
  let size = 0;
  for (const m of messages) {
    const line = new Date(m.ts).toISOString().slice(0, 7) + " " + m.text;
    if (size + line.length > chunkChars && lines.length > 0) {
      chunks.push(lines.join("\n"));
      lines = [];
      size = 0;
    }
    lines.push(line);
    size += line.length + 1;
  }
  if (lines.length > 0) chunks.push(lines.join("\n"));
  return chunks;
}

/**
 * Builds one person's interest profile from the messages they sent: the model reads them in chunks and lists
 * interests, a second pass merges those into one profile, and every interest is then checked against the full
 * history, repeats included. An interest the person's own messages don't actually mention is dropped.
 */
export async function buildInterestProfile(
  ownMessages: OwnMessage[],
  llm: Llm,
  options: {
    budgetChars?: number;
    chunkChars?: number;
    concurrency?: number;
    onProgress?: (done: number, total: number) => unknown;
  } = {},
): Promise<InterestProfile> {
  const messages = substantiveMessages(ownMessages);
  const distinct = distinctMessages(messages);
  if (distinct.length < MIN_MESSAGES) return { interests: [], messages: messages.length, read: 0 };
  const budget = options.budgetChars ?? READ_BUDGET_CHARS;
  const chunkChars = options.chunkChars ?? CHUNK_CHARS;
  const focus = focusMessages(distinct, budget * FOCUS_SHARE);
  const focused = new Set(focus);
  const rest = selectWithinBudget(
    distinct.filter((m) => !focused.has(m)),
    budget - focus.reduce((sum, m) => sum + lineChars(m), 0),
  );
  const focusChunks = chunkMessages(focus, chunkChars);
  const chunks = [...focusChunks, ...chunkMessages(rest, chunkChars)];
  const read = focus.length + rest.length;

  let done = 0;
  const failures: unknown[] = [];
  const extracted = await mapLimit(chunks, options.concurrency ?? CONCURRENCY, async (chunk) => {
    try {
      const result = await llm<{ interests: ExtractedInterest[] }>({
        name: "interests",
        system: EXTRACT_PROMPT,
        user: chunk,
        schema: EXTRACT_SCHEMA,
        effort: "minimal",
      });
      return result.interests;
    } catch (error) {
      failures.push(error);
      return [];
    } finally {
      await options.onProgress?.(++done, chunks.length);
    }
  });
  // A few lost chunks only thin the evidence; losing many would give a misleading profile.
  if (failures.length > chunks.length / 4) throw failures[0];

  const candidates = aggregate(extracted, focusChunks.length);
  if (candidates.length === 0) return { interests: [], messages: messages.length, read };
  const section = (title: string, list: Candidate[]) => (list.length > 0 ? [title, ...list.map(formatCandidate), ""] : []);
  const profile = await llm<{ interests: DraftInterest[] }>({
    name: "interest_profile",
    system: CONSOLIDATE_PROMPT,
    user: [
      ...section("Rare topics that keep coming back:", candidates.filter((c) => c.focus)),
      ...section("Other candidates:", candidates.filter((c) => !c.focus)),
    ].join("\n"),
    schema: PROFILE_SCHEMA,
    effort: "medium",
  });
  return { interests: ground(profile.interests, messages), messages: messages.length, read };
}

/** A message's size as a line the model reads: its text plus the month in front. */
function lineChars(m: OwnMessage): number {
  return m.text.length + 9;
}

/** Lowercase without accents, so "Café" and "cafe" match. */
export function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
}

/**
 * The terms that find someone's messages about an interest: its keywords, which the model picks to be unambiguous, and
 * the specifics longer than one word. A one-word specific can have an everyday meaning: "Curry" in a Warriors fan's
 * profile would also find every curry dinner.
 */
export function searchTerms(interest: { specifics: string[]; keywords: string[] }): string[] {
  return [...interest.keywords, ...interest.specifics.filter((s) => (fold(s).match(WORD_RE)?.length ?? 0) > 1)];
}

/**
 * Matches any of the terms as whole words in folded text. A long last word may continue ("climb" finds "climbing");
 * short ones only take a plural. Single words that are too short or too common to mean anything are ignored.
 */
export function termMatcher(terms: string[]): RegExp | null {
  const sources = new Set<string>();
  for (const term of terms) {
    const words = fold(term).match(WORD_RE);
    if (!words || (words.length === 1 && !isTopWordCandidate(words[0]))) continue;
    const last = words[words.length - 1];
    const tail = last.length >= 5 ? "[\\p{L}\\p{N}]*" : "(?:s|es)?(?![\\p{L}\\p{N}])";
    sources.add("(?<![\\p{L}\\p{N}])" + words.join("[^\\p{L}\\p{N}]+") + tail);
  }
  return sources.size > 0 ? new RegExp([...sources].join("|"), "u") : null;
}

interface ExtractedInterest {
  name: string;
  category: InterestCategory;
  /** Routines, logistics, and private topics: the model lists them anyway when a chunk is mostly small talk, so they're dropped here. */
  skip: boolean;
  note: string;
  specifics: string[];
  keywords: string[];
  messages: number;
}

interface DraftInterest {
  name: string;
  category: InterestCategory;
  skip: boolean;
  summary: string;
  specifics: string[];
  keywords: string[];
}

interface Candidate {
  name: string;
  category: InterestCategory;
  /** Came up in the focus messages. */
  focus: boolean;
  messages: number;
  parts: number;
  specifics: string[];
  keywords: string[];
  notes: string[];
}

type Counted = Map<string, { text: string; count: number }>;

/**
 * Merges the per-chunk lists by interest name, strongest first, leaving out the ones to skip. The first focusLists
 * lists come from the focus messages: those topics are rare by design and would lose a ranking by message count to
 * whatever fills the rest of the history, so they're always kept.
 */
function aggregate(lists: ExtractedInterest[][], focusLists: number): Candidate[] {
  interface Tally {
    name: string;
    focus: boolean;
    messages: number;
    parts: number;
    categories: Map<InterestCategory, number>;
    specifics: Counted;
    keywords: Counted;
    notes: string[];
  }
  const bump = (map: Counted, value: string) => {
    const text = value.trim().slice(0, 60);
    if (!text) return;
    const entry = map.get(text.toLowerCase());
    if (entry) entry.count++;
    else map.set(text.toLowerCase(), { text, count: 1 });
  };
  const top = (map: Counted, n: number) =>
    [...map.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, n)
      .map((e) => e.text);

  const byName = new Map<string, Tally>();
  lists.forEach((list, index) => {
    for (const item of list) {
      const key = normalizeName(item.name);
      if (!key || item.skip) continue;
      let tally = byName.get(key);
      if (!tally) {
        tally = { name: item.name.trim().slice(0, 60), focus: false, messages: 0, parts: 0, categories: new Map(), specifics: new Map(), keywords: new Map(), notes: [] };
        byName.set(key, tally);
      }
      tally.focus ||= index < focusLists;
      tally.messages += Math.max(1, Math.round(item.messages) || 1);
      tally.parts++;
      tally.categories.set(item.category, (tally.categories.get(item.category) ?? 0) + 1);
      for (const s of item.specifics) bump(tally.specifics, s);
      for (const k of item.keywords) bump(tally.keywords, k);
      const note = item.note.trim().slice(0, 120);
      if (note && tally.notes.length < 3) tally.notes.push(note);
    }
  });
  return [...byName.values()]
    .filter((t) => t.messages >= 2)
    .sort((a, b) => b.messages - a.messages || b.parts - a.parts)
    .filter((t, rank) => rank < MAX_CANDIDATES || t.focus)
    .map((t) => ({
      name: t.name,
      category: [...t.categories].sort((a, b) => b[1] - a[1])[0][0],
      focus: t.focus,
      messages: t.messages,
      parts: t.parts,
      specifics: top(t.specifics, 8),
      keywords: top(t.keywords, 8),
      notes: t.notes,
    }));
}

function formatCandidate(c: Candidate): string {
  return (
    "- " + c.name + " [" + c.category + "] " + c.messages + " messages, " + c.parts + (c.parts === 1 ? " part" : " parts") +
    (c.specifics.length ? " | specifics: " + c.specifics.join(", ") : "") +
    (c.keywords.length ? " | keywords: " + c.keywords.join(", ") : "") +
    (c.notes.length ? " | notes: " + c.notes.join("; ") : "")
  );
}

/** Counts each interest's mentions across the person's whole history and keeps the ones their messages really show. */
function ground(drafts: DraftInterest[], messages: OwnMessage[]): Interest[] {
  const folded = messages.map((m) => fold(m.text));
  const byName = new Map<string, Omit<Interest, "id">>();
  for (const draft of drafts) {
    const name = draft.name.trim().slice(0, 60);
    const key = normalizeName(name);
    const specifics = cleanList(draft.specifics, 8, 60);
    const keywords = cleanList(draft.keywords, 8, 40);
    const matcher = termMatcher([name, ...searchTerms({ specifics, keywords })]);
    if (!key || !matcher || draft.skip) continue;
    let mentions = 0;
    let firstAt: number | null = null;
    let lastAt: number | null = null;
    for (let i = 0; i < folded.length; i++) {
      if (!matcher.test(folded[i])) continue;
      mentions++;
      firstAt ??= messages[i].ts;
      lastAt = messages[i].ts;
    }
    if (mentions < MIN_MENTIONS || (byName.get(key)?.mentions ?? -1) >= mentions) continue;
    byName.set(key, {
      name,
      category: INTEREST_CATEGORIES.includes(draft.category) ? draft.category : "other",
      summary: draft.summary.trim().slice(0, 200),
      specifics,
      keywords,
      mentions,
      firstAt,
      lastAt,
    });
  }
  return [...byName.values()]
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, MAX_INTERESTS)
    .map((interest, i) => ({ id: "i" + (i + 1), ...interest }));
}

function cleanList(values: string[], max: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim().slice(0, maxLength);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length === max) break;
  }
  return out;
}

/** A stable pseudo-random number in [0, 1) for a string. */
function unitHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Topics no interest profile or comparison may include. */
export const LEAVE_OUT =
  "health, medical or mental-health topics, sexuality, dating, religion, politics, money or debt, legal trouble, and drugs";

/** What both passes flag with skip, which drops the item in code instead of trusting the model to leave it out. */
const SKIP =
  "true for everyday routines and logistics, or things nearly everyone does (running late, sleep, errands, rides and commuting, making plans to meet, places where people meet up, paying people back, losing things, phones and chargers, grabbing food or coffee, eating out in general, homework or studying in general, greetings and birthday wishes), and for anything about " +
  LEAVE_OUT +
  "; false for anything specific enough to bond over, like a sport, team, show, artist, game, hobby, a dish they cook, or a trip they're planning";

const EXTRACT_PROMPT = [
  "You read messages that one person sent to friends and family, one per line, each starting with its month. Most of them are everyday logistics and small talk, and lines that share a word may be grouped together. List that person's interests: the things they do, love, follow, make, or keep coming back to.",
  "",
  "Use only what the lines show about the writer. Good interests are specific and easy to bond over: sports they play and teams they follow, artists and genres, shows, films, books, podcasts, games, food and drink they cook or seek out, places they've been or want to go, outdoor activities, creative hobbies, things they collect or build, workouts, events and festivals, pets, skills and languages they're learning, clubs, schools, and communities they belong to.",
  "",
  "Leave out:",
  "- " + LEAVE_OUT + ", even if they come up a lot, and activities mentioned only as part of an injury, illness, or recovery;",
  "- names of people, addresses, phone numbers, and handles;",
  "- interests that belong to the people they're texting rather than to the writer.",
  "",
  "List every specific interest the lines show, including one that comes up in a single line.",
  "",
  "For each interest:",
  '- name: short and general, e.g. "rock climbing", "Golden State Warriors", "sourdough baking", "Japan travel".',
  "- category: the closest one.",
  "- skip: " + SKIP + ".",
  '- note: under 15 words on how it shows up, e.g. "boulders after work, planning a Yosemite trip".',
  "- specifics: up to 6 concrete things named in the lines (teams, artists, titles, venues, places, gear).",
  '- keywords: 2 to 6 words or short phrases copied exactly from the lines that a search would find, e.g. "bouldering", "climbing gym". Pick words that mostly come up when talking about this interest, not general ones like "game", "music", or "trip", or ones with common other meanings, like "running" in "running late".',
  "- messages: how many lines show this interest.",
  "",
  "Return at most 30 interests, strongest first, or an empty list when nothing qualifies.",
].join("\n");

const CONSOLIDATE_PROMPT = [
  "You're building one person's interest profile. Earlier passes each read part of the messages this person sent and listed candidate interests. Each candidate line shows how many messages support it, in how many parts it came up, the concrete things named, search keywords, and notes.",
  "",
  "The first section lists topics found by grouping messages that share a rare word. They come up rarely, but they keep coming back over time, so a low message count doesn't make them weak. Keep each specific one, merged with other candidates that are the same interest.",
  "",
  'Merge candidates that are the same interest (for example "climbing", "bouldering", and "climbing gym" become "rock climbing") and keep genuinely different interests apart. Drop candidates that are weak (one passing mention), too general to bond over ("food", "coffee", "texting", "work"), or about ' + LEAVE_OUT + ".",
  "",
  "Keep an interest only when at least two messages show it. A specific interest that comes up in only a few messages still belongs in the profile.",
  "",
  "For each interest you keep:",
  "- name: short and general.",
  "- category: the closest one.",
  "- skip: " + SKIP + ".",
  '- summary: one phrase under 20 words, with no subject, on how it shows up for this person, e.g. "boulders at Mission Cliffs a few times a week and plans climbing trips". No quotes and no names of people.',
  "- specifics: up to 8 concrete things from the candidates (teams, artists, titles, venues, places).",
  "- keywords: 3 to 8 search terms taken from the candidates' keywords and specifics. Don't invent new ones, and leave out words with a common other meaning, like a player named Curry.",
  "",
  "Return up to 60 interests, strongest first.",
].join("\n");

const stringList = { type: "array", items: { type: "string" } };
const categoryEnum = { type: "string", enum: [...INTEREST_CATEGORIES] };

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["interests"],
  properties: {
    interests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "skip", "note", "specifics", "keywords", "messages"],
        properties: {
          name: { type: "string" },
          category: categoryEnum,
          skip: { type: "boolean" },
          note: { type: "string" },
          specifics: stringList,
          keywords: stringList,
          messages: { type: "integer" },
        },
      },
    },
  },
};

const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["interests"],
  properties: {
    interests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "skip", "summary", "specifics", "keywords"],
        properties: {
          name: { type: "string" },
          category: categoryEnum,
          skip: { type: "boolean" },
          summary: { type: "string" },
          specifics: stringList,
          keywords: stringList,
        },
      },
    },
  },
};
