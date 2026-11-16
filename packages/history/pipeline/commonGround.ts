import {
  fold,
  INTEREST_CATEGORIES,
  LEAVE_OUT,
  peopleChats,
  searchTerms,
  termMatcher,
  type ChatSource,
  type Interest,
  type InterestCategory,
  type InterestProfile,
} from "./interests";
import type { Llm } from "./llm";
import type { MessageStore } from "./store";
import { isTopWordCandidate, normalizeName } from "./text";

/** A text has to be at least this long to count as the same message showing up in both histories. */
const MATCH_MIN_CHARS = 12;
/**
 * Both copies of a message carry (almost) the same time. A tight window is what rules out coincidences: plenty of
 * people send "running 5 min late sorry", but not to each other within the same few minutes.
 */
const MATCH_WINDOW_MS = 5 * 60_000;
/** Matched messages a sender needs before they count as the other person. */
const MIN_MATCHES = 2;
/** Messages between the two people about something before it counts as something they already know they share. */
export const KNOWN_AFTER = 3;
const MAX_ITEMS = 25;
/** Too broad to tell whether two people have talked about a specific shared interest. */
const GENERIC_WORDS = new Set(["game", "games", "show", "shows", "music", "song", "songs", "movie", "movies", "film", "book", "books", "trip", "food", "work", "team", "play", "playing", "watch", "watching", "class"]);
const MATCH_RANK = { same: 0, activity: 1, related: 2 } as const;
const WORD_RE = /[\p{L}\p{N}]+/gu;

export interface CommonGroundSide {
  /** The person's partition in the message store. */
  owner: string;
  chats: ChatSource[];
  profile: InterestProfile;
}

/** Chats in one person's history that the other person takes part in, and the sender names the other has there. */
export interface SharedChats {
  keys: string[];
  otherSenders: string[];
}

export interface SharedSide {
  /** How it shows up for this person, as a phrase with no subject. */
  detail: string;
  /** Messages this person wrote about it. */
  mentions: number;
  /** When this person first wrote about it. */
  since: number | null;
}

export type MatchKind = keyof typeof MATCH_RANK;

export interface SharedInterest {
  title: string;
  category: InterestCategory;
  /** same: the same specific thing; activity: the same activity or hobby; related: close enough to bond over. */
  match: MatchKind;
  /** True when it has come up fewer than KNOWN_AFTER times in the chats the two have with each other. */
  hidden: boolean;
  /** Messages between the two of them that mention it. */
  betweenYou: number;
  /** A casual line either of them could use to bring it up. */
  starter: string;
  a: SharedSide;
  b: SharedSide;
}

export interface CommonGround {
  /** Things that never came up between the two of them first, then the ones they've talked about. */
  items: SharedInterest[];
  /** How many chats in each person's history the other takes part in: their DM and any groups both are in. */
  sharedChats: { a: number; b: number };
}

/**
 * Compares two people's interest profiles and checks each overlap against the chats they have with each other, so
 * the ones that never came up between them can be told apart. The model only sees the two profiles, never messages.
 */
export async function findCommonGround(input: { store: MessageStore; llm: Llm; a: CommonGroundSide; b: CommonGroundSide }): Promise<CommonGround> {
  const { store, llm, a, b } = input;
  const [raw, between] = await Promise.all([
    a.profile.interests.length > 0 && b.profile.interests.length > 0 ? compareProfiles(llm, a.profile.interests, b.profile.interests) : [],
    (async () => {
      const shared = await findSharedChats(store, a, b);
      const texts = await Promise.all([betweenTexts(store, a, shared.a), betweenTexts(store, b, shared.b)]);
      return { shared, texts };
    })(),
  ]);
  return {
    items: finalizeShared(raw, a.profile.interests, b.profile.interests, between.texts),
    sharedChats: { a: between.shared.a.keys.length, b: between.shared.b.keys.length },
  };
}

/**
 * Finds the chats two people have with each other without knowing their names or numbers: a text one of them sent
 * shows up, at (almost) the same time, among the texts the other received. The sender of those copies is how the
 * other person appears in this history, which also finds group chats they're in but rarely write in.
 */
export async function findSharedChats(
  store: MessageStore,
  a: Pick<CommonGroundSide, "owner" | "chats">,
  b: Pick<CommonGroundSide, "owner" | "chats">,
): Promise<{ a: SharedChats; b: SharedChats }> {
  const [sentByA, sentByB] = await Promise.all([sentIndex(store, a), sentIndex(store, b)]);
  const [inA, inB] = await Promise.all([receivedMatches(store, a, sentByB), receivedMatches(store, b, sentByA)]);
  return { a: inA, b: inB };
}

async function sentIndex(store: MessageStore, side: Pick<CommonGroundSide, "owner" | "chats">): Promise<Map<string, number[]>> {
  const index = new Map<string, number[]>();
  for await (const page of store.texts(side.owner, peopleChats(side.chats), "self", MATCH_MIN_CHARS)) {
    for (const row of page) {
      const key = matchKey(row.text);
      if (key.length < MATCH_MIN_CHARS) continue;
      const times = index.get(key);
      if (times) times.push(row.ts);
      else index.set(key, [row.ts]);
    }
  }
  return index;
}

async function receivedMatches(
  store: MessageStore,
  side: Pick<CommonGroundSide, "owner" | "chats">,
  sentByOther: Map<string, number[]>,
): Promise<SharedChats> {
  const matches = new Map<string, { count: number; chats: Set<string> }>();
  for await (const page of store.texts(side.owner, peopleChats(side.chats), "others", MATCH_MIN_CHARS)) {
    for (const row of page) {
      const times = sentByOther.get(matchKey(row.text));
      if (!times?.some((ts) => Math.abs(ts - row.ts) <= MATCH_WINDOW_MS)) continue;
      const sender = matches.get(row.sender) ?? { count: 0, chats: new Set<string>() };
      sender.count++;
      sender.chats.add(row.conversation);
      matches.set(row.sender, sender);
    }
  }
  // A single coincidental match (two people sending "happy birthday!!" the same day) doesn't make someone the other person.
  const other = [...matches].filter(([, m]) => m.count >= MIN_MATCHES);
  const otherSenders = new Set(other.map(([sender]) => sender));
  const matchedChats = new Set(other.flatMap(([, m]) => [...m.chats]));
  const keys = peopleChats(side.chats)
    .map((c) => c.key)
    .filter((key) => matchedChats.has(key) || side.chats.find((c) => c.key === key)!.participants.some((p) => otherSenders.has(p)));
  return { keys, otherSenders: [...otherSenders] };
}

/** What the two people wrote to each other in their shared chats (other members' messages left out), folded. */
async function betweenTexts(store: MessageStore, side: CommonGroundSide, shared: SharedChats): Promise<string[]> {
  if (shared.keys.length === 0) return [];
  const selfNames = new Map(side.chats.map((c) => [c.key, c.selfName]));
  const other = new Set(shared.otherSenders);
  const texts: string[] = [];
  for await (const page of store.scan(side.owner, shared.keys)) {
    const self = selfNames.get(page.conversation);
    for (const m of page.messages) {
      if (m.text && (m.sender === self || other.has(m.sender))) texts.push(fold(m.text));
    }
  }
  return texts;
}

function matchKey(text: string): string {
  return fold(text)
    .replace(/[\u200b-\u200f\u2060\ufeff\ufffc]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface RawShared {
  title: string;
  category: InterestCategory;
  match: MatchKind;
  a_ids: string[];
  b_ids: string[];
  a_detail: string;
  b_detail: string;
  starter: string;
}

async function compareProfiles(llm: Llm, a: Interest[], b: Interest[]): Promise<RawShared[]> {
  const result = await llm<{ shared: RawShared[] }>({
    name: "common_ground",
    system: COMPARE_PROMPT,
    user: formatProfiles(a, b),
    schema: COMPARE_SCHEMA,
    effort: "low",
  });
  return result.shared;
}

/** The two profiles as the model sees them, with interest ids a1, a2, ... and b1, b2, ... */
export function formatProfiles(a: Interest[], b: Interest[]): string {
  const describe = (label: string, prefix: string, interests: Interest[]) => [
    label,
    ...interests.map(
      (i, k) =>
        "[" + prefix + (k + 1) + "] " + i.name + " (" + i.category + "): " + i.summary +
        (i.specifics.length ? " Named: " + i.specifics.join(", ") + "." : "") +
        " " + i.mentions + " messages" + (i.firstAt !== null && i.lastAt !== null ? ", " + years(i.firstAt, i.lastAt) : "") + ".",
    ),
  ];
  const both = namedByBoth(a, b);
  return [...describe("Person A", "a", a), "", ...describe("Person B", "b", b), ...(both.length ? ["", "Named by both: " + both.join(", ")] : [])].join("\n");
}

function years(first: number, last: number): string {
  const from = new Date(first).getUTCFullYear();
  const to = new Date(last).getUTCFullYear();
  return from === to ? String(from) : from + "-" + to;
}

/** Names, specifics, and keywords that appear word for word in both profiles: strong hints for the comparison. */
function namedByBoth(a: Interest[], b: Interest[]): string[] {
  const terms = (interests: Interest[]) => {
    const map = new Map<string, string>();
    for (const term of interests.flatMap((i) => [i.name, ...i.specifics, ...i.keywords])) {
      const key = normalizeName(term);
      if (!map.has(key) && (key.includes(" ") || isTopWordCandidate(key))) map.set(key, term);
    }
    return map;
  };
  const inB = terms(b);
  return [...terms(a)].filter(([key]) => inB.has(key)).map(([, term]) => term).slice(0, 40);
}

/**
 * Keeps the overlaps that point at real interests on both sides, counts how often each came up between the two
 * people, and orders them: the ones that never came up between them first, the most specific matches first within.
 */
export function finalizeShared(raw: RawShared[], a: Interest[], b: Interest[], between: string[][]): SharedInterest[] {
  const pick = (ids: string[], prefix: string, interests: Interest[]) =>
    [...new Set(ids.map((id) => id.trim().toLowerCase()))].flatMap((id) => {
      const index = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
      const interest = Number.isInteger(index) ? interests[index - 1] : undefined;
      return interest ? [interest] : [];
    });
  const seen = new Set<string>();
  const usedA = new Set<Interest>();
  const usedB = new Set<Interest>();
  const items: SharedInterest[] = [];
  for (const r of raw) {
    const fromA = pick(r.a_ids, "a", a);
    const fromB = pick(r.b_ids, "b", b);
    const title = r.title.trim().slice(0, 60);
    const key = normalizeName(title);
    if (fromA.length === 0 || fromB.length === 0 || !key || seen.has(key)) continue;
    // Another angle on interests an earlier item already pairs up ("Tokyo" after "Travel to Japan").
    if (fromA.every((i) => usedA.has(i)) && fromB.every((i) => usedB.has(i))) continue;
    seen.add(key);
    fromA.forEach((i) => usedA.add(i));
    fromB.forEach((i) => usedB.add(i));
    const terms = [...fromA, ...fromB].flatMap(searchTerms).filter(isSpecific);
    const matcher = termMatcher(terms);
    const betweenYou = matcher ? Math.max(0, ...between.map((texts) => texts.filter((t) => matcher.test(t)).length)) : 0;
    items.push({
      title,
      category: INTEREST_CATEGORIES.includes(r.category) ? r.category : fromA[0].category,
      match: r.match in MATCH_RANK ? r.match : "related",
      hidden: betweenYou < KNOWN_AFTER,
      betweenYou,
      starter: r.starter.trim().slice(0, 200),
      a: sideOf(r.a_detail, fromA),
      b: sideOf(r.b_detail, fromB),
    });
  }
  // Stable sort: the model's order (most specific and surprising first) holds within each group.
  return items.sort((x, y) => Number(y.hidden) - Number(x.hidden) || MATCH_RANK[x.match] - MATCH_RANK[y.match]).slice(0, MAX_ITEMS);
}

function sideOf(detail: string, interests: Interest[]): SharedSide {
  const firsts = interests.map((i) => i.firstAt).filter((ts): ts is number => ts !== null);
  return {
    detail: detail.trim().slice(0, 120) || interests[0].summary,
    mentions: Math.max(...interests.map((i) => i.mentions)),
    since: firsts.length ? Math.min(...firsts) : null,
  };
}

function isSpecific(term: string): boolean {
  const words = fold(term).match(WORD_RE);
  return !!words && (words.length > 1 || !GENERIC_WORDS.has(words[0]));
}

const COMPARE_PROMPT = [
  "Two people each have an interest profile, built separately from the messages each of them sent. Find everything they genuinely have in common.",
  "",
  "Something counts as shared when:",
  "- both are into the same specific thing: the same artist, team, show, game, book, place, venue, school, or event;",
  "- both do the same activity or hobby, even if they name it differently (bouldering and rock climbing); or",
  "- their interests are close enough to bond over (one bakes sourdough, the other runs a bread blog).",
  "",
  "Skip overlaps nearly everyone shares, like eating out, coffee or boba, music, movies, travel, studying, classes, or work, unless both name the same specific thing within them (the same artist, show, city, course, or restaurant). Never list anything about " + LEAVE_OUT + ", and never name other people.",
  "",
  "Give each shared interest one item. Fold the specifics both mention (cities, albums, gear, episodes) into its details instead of listing them as separate items.",
  "",
  "For each shared thing:",
  '- title: the shared interest itself in 1 to 4 words, e.g. "Bouldering", "Phoebe Bridgers", "Lisbon", "Sourdough baking".',
  "- category: the closest one.",
  '- match: "same" when it\'s the same specific thing, "activity" when it\'s the same activity or hobby, "related" when it\'s only close.',
  "- a_ids and b_ids: the ids of the interests it's based on in each profile.",
  '- a_detail and b_detail: under 12 words each, with no subject, on how it shows up for that person, using only their own profile, e.g. "boulders at Mission Cliffs most weeks". No quotes and no names.',
  "- starter: one casual line either of them could say to bring it up.",
  "",
  "List every genuine overlap, the most specific and surprising first, up to 25. Return an empty list when there is none.",
].join("\n");

const COMPARE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["shared"],
  properties: {
    shared: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "category", "match", "a_ids", "b_ids", "a_detail", "b_detail", "starter"],
        properties: {
          title: { type: "string" },
          category: { type: "string", enum: [...INTEREST_CATEGORIES] },
          match: { type: "string", enum: Object.keys(MATCH_RANK) },
          a_ids: { type: "array", items: { type: "string" } },
          b_ids: { type: "array", items: { type: "string" } },
          a_detail: { type: "string" },
          b_detail: { type: "string" },
          starter: { type: "string" },
        },
      },
    },
  },
};
