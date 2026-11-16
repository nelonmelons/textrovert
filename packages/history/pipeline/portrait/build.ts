import type { ConversationRef } from "../assistant/agent";
import type { EpisodeIndex, StoredEpisode } from "../assistant/episodes";
import type { MessageStore, StoredMessage } from "../store";
import type { Chapter, Conversation, Count, Edge, EpisodeLite, Group, Person, PlanRef, Portrait, Receipt, Story } from "./types";

const DAY = 86_400_000;
export const STORY_MODEL = "gpt-5-mini";

/** Everything the portrait is computed from: the chat directory, every message by conversation key, and the episodes. */
export interface PortraitSource {
  refs: ConversationRef[];
  messages: Map<string, StoredMessage[]>;
  episodes: StoredEpisode[];
  timeZone: string;
}

/** Writes one memoir: gets the system and user prompts and returns the model's JSON (shaped by STORY_SCHEMA). */
export type WriteStory = (system: string, user: string) => Promise<unknown>;

export interface PortraitAnalysis {
  /** The portrait without memoirs; receipts cover the plans of the closest people. */
  portrait: Portrait;
  /** A person by display name, case-insensitive. */
  personNamed(name: string): Person | undefined;
  /** Writes one person's memoir; every footnote is checked against that person's chats and sentences without one are dropped. */
  storyFor(personId: string, write: WriteStory): Promise<Story | null>;
  /** The portrait with these memoirs and the receipts they cite. */
  withStories(stories: Story[]): Portrait;
}

/** Reads the source of a portrait from the store: the given chats' messages, oldest first, and their episodes. */
export async function loadPortraitSource(store: MessageStore, episodeIndex: EpisodeIndex, owner: string, refs: ConversationRef[], timeZone: string): Promise<PortraitSource> {
  const messages = new Map<string, StoredMessage[]>();
  for await (const page of store.scan(owner, refs.map((r) => r.key))) {
    const list = messages.get(page.conversation) ?? [];
    list.push(...page.messages);
    messages.set(page.conversation, list);
  }
  const keys = new Set(refs.map((r) => r.key));
  const episodes = (await episodeIndex.find(owner, refs.length < 400 ? { conversations: [...keys] } : {}, 1_000_000)).filter((e) => keys.has(e.conversation));
  episodes.sort((a, b) => a.startTs - b.startTs);
  return { refs, messages, episodes, timeZone };
}

const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "x";
const top = (counts: Map<string, number>, n: number): Count[] => [...counts].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

function evenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

export const STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "chapters"],
  properties: {
    headline: { type: "string", description: "one evocative line, under 12 words, about this friendship" },
    chapters: {
      type: "array",
      description: "3-6 chapters in chronological order, each covering a distinct time period",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "sentences"],
        properties: {
          title: { type: "string", description: "2-5 word chapter title" },
          sentences: {
            type: "array",
            description: "2-5 sentences",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "refs"],
              properties: {
                text: { type: "string", description: "plain prose; no #ids or citations in the text itself" },
                refs: { type: "array", items: { type: "number" }, description: "1-3 #ids of messages that back this sentence" },
              },
            },
          },
        },
      },
    },
  },
};

/** The OpenAI request body for one memoir; callers hash it to cache responses. */
export const storyRequestBody = (system: string, user: string) =>
  JSON.stringify({
    model: STORY_MODEL,
    reasoning_effort: "minimal",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: "story", strict: true, schema: STORY_SCHEMA } },
  });

/** A memoir writer on OpenAI's chat completions, retrying rate limits and server errors twice. */
export function openAiStoryWriter(apiKey: string, cache?: { get(body: string): unknown; put(body: string, value: unknown): void }): WriteStory {
  return async (system, user) => {
    const body = storyRequestBody(system, user);
    const hit = cache?.get(body);
    if (hit !== undefined) return hit;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
        body,
      });
      if (res.ok) {
        const json = (await res.json()) as { choices: { message: { content: string } }[] };
        const parsed = JSON.parse(json.choices[0].message.content);
        cache?.put(body, parsed);
        return parsed;
      }
      if (attempt >= 2 || (res.status !== 429 && res.status < 500)) throw new Error("Story request failed: " + res.status + " " + (await res.text()).slice(0, 300));
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  };
}

/**
 * Turns chat history into the portrait: people with per-bucket volume, groups, who-knows-whom edges, episodes, plans,
 * topics and moods. Series are weekly for histories under ~18 months and monthly otherwise.
 */
export function analyzePortrait(source: PortraitSource): PortraitAnalysis {
  const { refs, messages: byConv, episodes: stored, timeZone: TZ } = source;
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const list of byConv.values()) {
    for (const m of list) {
      if (m.ts < minTs) minTs = m.ts;
      if (m.ts > maxTs) maxTs = m.ts;
    }
  }
  if (minTs === Infinity) minTs = maxTs = Date.now();

  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayNumber = (ts: number) => Date.parse(localDay.format(ts) + "T00:00:00Z") / DAY;

  // ---------- timeline: weekly buckets for short histories, monthly otherwise ----------
  const firstDay = dayNumber(minTs);
  const lastDay = dayNumber(maxTs);
  const unit: "week" | "month" = lastDay - firstDay < 540 ? "week" : "month";
  const monthIndex = (d: number) => {
    const date = new Date(d * DAY);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
  };
  const startWeekDay = firstDay - ((new Date(firstDay * DAY).getUTCDay() + 6) % 7);
  const bucketOfDay = (d: number) => (unit === "week" ? Math.floor((d - startWeekDay) / 7) : monthIndex(d) - monthIndex(firstDay));
  const bucketCount = bucketOfDay(lastDay) + 1;
  const starts: number[] = [];
  const labels: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const d =
      unit === "week"
        ? startWeekDay + i * 7
        : Date.UTC(Math.floor((monthIndex(firstDay) + i) / 12), (monthIndex(firstDay) + i) % 12, 1) / DAY;
    starts.push(d * DAY);
    labels.push(
      new Date(d * DAY).toLocaleDateString("en-US", unit === "week" ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }),
    );
  }
  const bucket = (ts: number) => bucketOfDay(dayNumber(ts));
  const zeros = () => new Array<number>(bucketCount).fill(0);

  // ---------- people and groups ----------
  const selfNames = new Set(refs.map((r) => r.selfName?.toLowerCase()).filter((s): s is string => !!s));
  const isSelf = (name: string) => selfNames.has(name.toLowerCase()) || name === "Me";
  const people = new Map<string, Person>();
  const personByLower = new Map<string, Person>();
  const personFor = (name: string, platform: string) => {
    const lower = name.trim().toLowerCase();
    let p = personByLower.get(lower);
    if (p && p.name === p.name.toLowerCase() && name !== lower) p.name = name.trim();
    if (!p) {
      let id = slug(name);
      while (people.has(id)) id += "-";
      p = {
        id, name: name.trim(), platform, dmThem: zeros(), dmMe: zeros(), groupThem: zeros(), total: 0, firstTs: null, lastTs: null,
        dm: null, groups: [], episodes: [], plans: [], topics: [], moods: [], places: [], mood: null, closeness: 0,
      };
      people.set(id, p);
      personByLower.set(lower, p);
    }
    return p;
  };
  const touch = (p: Person, ts: number) => {
    p.firstTs = p.firstTs === null ? ts : Math.min(p.firstTs, ts);
    p.lastTs = p.lastTs === null ? ts : Math.max(p.lastTs, ts);
  };

  const conversations: Conversation[] = refs.map((r) => ({ id: r.id, title: r.title, kind: r.kind === "dm" ? "dm" : "group", platform: r.platform, messageCount: r.messageCount }));
  const refByKey = new Map(refs.map((r) => [r.key, r]));
  const groups: Group[] = [];
  const groupTopics = new Map<string, Map<string, number>>();
  let myTotal = 0;

  for (const r of refs) {
    const messages = byConv.get(r.key) ?? [];
    const others = r.participants.filter((n) => !isSelf(n));
    const members = others.map((n) => personFor(n, r.platform));
    if (r.kind === "dm" && members.length === 1) {
      const p = members[0];
      p.dm = r.id;
      for (const m of messages) {
        if (!m.sender) continue;
        const b = bucket(m.ts);
        if (isSelf(m.sender)) p.dmMe[b]++;
        else p.dmThem[b]++;
        touch(p, m.ts);
      }
    } else {
      const series = zeros();
      for (const m of messages) {
        series[bucket(m.ts)]++;
        if (!m.sender || isSelf(m.sender)) continue;
        const p = personByLower.get(m.sender.toLowerCase());
        if (p) {
          p.groupThem[bucket(m.ts)]++;
          touch(p, m.ts);
        }
      }
      for (const p of members) p.groups.push(r.id);
      groups.push({ id: r.id, title: r.title, platform: r.platform, members: members.map((p) => p.id), series, total: messages.length, topics: [] });
      groupTopics.set(r.id, new Map());
    }
    myTotal += messages.filter((m) => isSelf(m.sender)).length;
  }

  // ---------- episodes ----------
  const episodes: EpisodeLite[] = [];
  const coMention = new Map<string, number>();
  const personTopics = new Map<string, Map<string, number>>();
  const personMoods = new Map<string, Map<string, number>>();
  const personPlaces = new Map<string, Map<string, number>>();
  const pairKey = (a: string, b: string) => (a < b ? a + "|" + b : b + "|" + a);
  const groupIds = new Set(groups.map((g) => g.id));

  for (const e of stored) {
    const ref = refByKey.get(e.conversation);
    if (!ref) continue;
    episodes.push({
      id: e.id, conversation: ref.id, start: e.startTs, end: e.endTs, title: e.title, summary: e.summary,
      topics: e.topics, people: e.people, mood: e.mood, kind: e.kind, plans: e.plans,
    });
    if (groupIds.has(ref.id)) for (const t of e.topics) bump(groupTopics.get(ref.id)!, t.toLowerCase());
    const involved = new Set<Person>();
    for (const name of [...e.senders, ...e.people]) {
      if (isSelf(name)) continue;
      const p = personByLower.get(name.toLowerCase().replace(/^@/, ""));
      if (p) involved.add(p);
    }
    if (ref.kind === "dm") {
      const p = people.get(personByLower.get(ref.participants.find((n) => !isSelf(n))?.toLowerCase() ?? "")?.id ?? "");
      if (p) involved.add(p);
    }
    for (const p of involved) {
      p.episodes.push(e.id);
      const t = personTopics.get(p.id) ?? new Map();
      for (const topic of e.topics) bump(t, topic.toLowerCase());
      personTopics.set(p.id, t);
      const md = personMoods.get(p.id) ?? new Map();
      bump(md, e.mood);
      personMoods.set(p.id, md);
      const pl = personPlaces.get(p.id) ?? new Map();
      for (const place of e.places) bump(pl, place);
      personPlaces.set(p.id, pl);
      for (const plan of e.plans) {
        if (!plan.who.some((w) => w.toLowerCase() === p.name.toLowerCase()) && ref.kind !== "dm") continue;
        p.plans.push({ ...plan, episode: e.id, conversation: ref.id, ts: e.startTs } satisfies PlanRef);
      }
    }
    const list = [...involved];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) bump(coMention, pairKey(list[i].id, list[j].id));
  }

  // ---------- closeness ----------
  const moodCounts = new Map<string, number>();
  for (const e of episodes) bump(moodCounts, e.mood);
  /** Share of all episodes with this mood, so a person's color shows what sets them apart rather than the overall default. */
  const globalMood = (mood: string) => (moodCounts.get(mood) ?? 0) / (episodes.length || 1) + 0.02;
  const tau = Math.max(2, bucketCount / 4);
  for (const p of people.values()) {
    const sums = p.dmThem.map((n, i) => n + p.dmMe[i] + p.groupThem[i] * 0.35);
    p.total = p.dmThem.reduce((s, n) => s + n, 0) + p.dmMe.reduce((s, n) => s + n, 0) + p.groupThem.reduce((s, n) => s + n, 0);
    const recent = sums.reduce((s, n, i) => s + n * Math.exp(-(bucketCount - 1 - i) / tau), 0);
    const span = p.firstTs !== null && p.lastTs !== null ? (p.lastTs - p.firstTs) / (maxTs - minTs || 1) : 0;
    p.closeness = Math.sqrt(recent) * Math.log1p(p.total) * (0.5 + span);
    p.topics = top(personTopics.get(p.id) ?? new Map(), 8);
    p.moods = top(personMoods.get(p.id) ?? new Map(), 8);
    p.places = top(personPlaces.get(p.id) ?? new Map(), 6);
    const moodTotal = p.moods.reduce((s, [, n]) => s + n, 0);
    p.mood = [...p.moods].filter(([, n]) => n >= 2).sort((a, b) => b[1] / moodTotal / globalMood(b[0]) - a[1] / moodTotal / globalMood(a[0]))[0]?.[0] ?? p.moods[0]?.[0] ?? null;
    p.plans.sort((a, b) => b.ts - a.ts);
  }
  const maxCloseness = Math.max(...[...people.values()].map((p) => p.closeness), 1e-9);
  for (const p of people.values()) p.closeness = Math.round((p.closeness / maxCloseness) * 1000) / 1000;
  for (const g of groups) g.topics = top(groupTopics.get(g.id)!, 8);

  // ---------- edges ----------
  const coGroup = new Map<string, number>();
  for (const g of groups) {
    if (g.members.length < 2 || g.total === 0) continue;
    const w = Math.log1p(g.total) / (g.members.length - 1);
    for (let i = 0; i < g.members.length; i++) for (let j = i + 1; j < g.members.length; j++) bump(coGroup, pairKey(g.members[i], g.members[j]), w);
  }
  const edges: Edge[] = [];
  for (const key of new Set([...coGroup.keys(), ...coMention.keys()])) {
    const [a, b] = key.split("|");
    const weight = (coGroup.get(key) ?? 0) + Math.log1p(coMention.get(key) ?? 0) * 2;
    if (weight > 0.5) edges.push({ a, b, weight: Math.round(weight * 100) / 100 });
  }
  edges.sort((x, y) => y.weight - x.weight);

  const peopleList = [...people.values()].sort((a, b) => b.closeness - a.closeness || b.total - a.total);

  // ---------- stories ----------
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
  const messageById = new Map<number, { m: StoredMessage; ref: ConversationRef }>();
  for (const [key, list] of byConv) {
    const ref = refByKey.get(key);
    if (ref) for (const m of list) messageById.set(m.id, { m, ref });
  }
  const label = (sender: string) => (isSelf(sender) ? "Me" : sender);
  const episodeById = new Map(stored.map((e) => [e.id, e]));

  const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });
  const monthOnly = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long" });
  /** A chapter's period comes from the messages it cites, never from the model. */
  function periodOf(from: number, to: number): string {
    if (to - from < 4 * DAY) return monthDay.format(from);
    if (unit === "month" || to - from > 75 * DAY) return monthOnly.format(from) + " – " + monthOnly.format(to);
    return monthDay.format(from) + " – " + monthDay.format(to);
  }

  async function storyFor(personId: string, write: WriteStory): Promise<Story | null> {
    const p = people.get(personId);
    if (!p) return null;
    const convKeys = new Set(refs.filter((r) => r.id === p.dm || p.groups.includes(r.id)).map((r) => r.key));
    const eps = evenly(p.episodes.map((id) => episodeById.get(id)!).filter((e) => convKeys.has(e.conversation)), 70);
    const epText = eps
      .map((e) => {
        const plans = e.plans.map((pl) => " plan: " + pl.what + (pl.when ? " (" + pl.when + ")" : "") + " #" + pl.sources[0]).join(";");
        return "#" + e.firstId + " [" + stamp.format(e.startTs) + ", " + refByKey.get(e.conversation)!.title + "] " + e.title + " — " + e.summary + plans;
      })
      .join("\n");
    const dmRef = refs.find((r) => r.id === p.dm);
    const dmMessages = dmRef ? (byConv.get(dmRef.key) ?? []).filter((m) => m.text && m.kind === "text") : [];
    const groupMessages = [...convKeys]
      .filter((k) => refByKey.get(k)!.kind !== "dm")
      .flatMap((k) => (byConv.get(k) ?? []).filter((m) => m.text && m.kind === "text" && m.sender.toLowerCase() === p.name.toLowerCase() && m.text.length > 12));
    const sample = [...evenly(dmMessages, 110), ...evenly(groupMessages, dmMessages.length ? 40 : 110)].sort((a, b) => a.ts - b.ts);
    const sampleText = sample
      .map((m) => "#" + m.id + " [" + stamp.format(m.ts) + (refByKey.get(m.conversation)!.kind === "dm" ? "" : ", " + refByKey.get(m.conversation)!.title) + "] " + label(m.sender) + ": " + m.text!.slice(0, 220).replace(/\s+/g, " "))
      .join("\n");
    if (!eps.length && !sample.length) return null;
    const raw = (await write(
      "You write short, warm, specific memoirs of a friendship from chat history, in second person (\"you\" is the user, called Me in the data). " +
        "Split the friendship into 3-6 chapters by time period, chronological. Each sentence must be grounded: cite 1-3 #ids from the material that directly support it. " +
        "Use concrete details (places, plans, jokes, games, events). Never invent facts. Keep it tender but not cheesy; light humor is fine. Avoid crude content.",
      "Friend: " + p.name + "\nFirst contact: " + (p.firstTs ? stamp.format(p.firstTs) : "?") + ", last: " + (p.lastTs ? stamp.format(p.lastTs) : "?") +
        "\nShared group chats: " + p.groups.map((g) => refs.find((r) => r.id === g)!.title).join(", ") +
        "\n\nEPISODES (#id is the first message of the episode):\n" + epText + "\n\nSAMPLE MESSAGES:\n" + sampleText,
    )) as { headline?: string; chapters?: { title: string; sentences: { text: string; refs: number[] }[] }[] };
    const episodeByFirst = new Map(eps.map((e) => [e.firstId, e]));
    const chapters: Chapter[] = [];
    for (const c of raw.chapters ?? []) {
      const sentences = c.sentences.flatMap((s) => {
        const valid = [...new Set(s.refs.map(Number))].filter((id) => convKeys.has(messageById.get(id)?.ref.key ?? ""));
        if (!valid.length) return [];
        // A footnote on an episode's first message stands for the whole moment: add the friend's fullest lines from it.
        const cited = valid.map((id) => episodeByFirst.get(id)).filter((e): e is StoredEpisode => !!e);
        const extra = cited.flatMap((e) =>
          (byConv.get(e.conversation) ?? [])
            .filter((m) => m.ts >= e.startTs && m.ts <= e.endTs && m.text && m.kind === "text" && !valid.includes(m.id))
            .filter((m) => m.sender.toLowerCase() === p.name.toLowerCase() || (refByKey.get(e.conversation)!.kind === "dm" && m.text!.length > 20))
            .sort((a, b) => b.text!.length - a.text!.length)
            .slice(0, 3)
            .map((m) => m.id),
        );
        const text = s.text.replace(/\s*\((?:#?\d+[,;\s]*)+\)/g, "").replace(/\s*#\d+/g, "").trim();
        return [{ text, refs: [...valid, ...extra], ...(cited.length ? { episodes: cited.map((e) => e.id) } : {}) }];
      });
      const times = sentences.flatMap((s) => s.refs.slice(0, 3).map((id) => messageById.get(id)!.m.ts));
      if (sentences.length) chapters.push({ title: c.title, period: periodOf(Math.min(...times), Math.max(...times)), sentences });
    }
    return chapters.length ? { person: p.id, headline: String(raw.headline ?? ""), chapters } : null;
  }

  // ---------- receipts ----------
  function withStories(stories: Story[]): Portrait {
    const receipts: Record<string, Receipt> = {};
    const cite = (id: number) => {
      const hit = messageById.get(id);
      if (!hit || receipts[id]) return;
      receipts[id] = { id, ts: hit.m.ts, sender: label(hit.m.sender), text: hit.m.text ?? "[" + hit.m.kind + "]", conversation: hit.ref.title };
    };
    for (const s of stories) for (const c of s.chapters) for (const sentence of c.sentences) sentence.refs.forEach(cite);
    for (const p of peopleList.slice(0, 60)) for (const plan of p.plans) plan.sources.forEach(cite);
    return {
      generatedAt: Date.now(),
      timeZone: TZ,
      me: { name: "Me", total: myTotal },
      timeline: { unit, starts, labels },
      conversations,
      people: peopleList,
      groups: [...groups].sort((a, b) => b.total - a.total),
      edges,
      episodes,
      stories,
      receipts,
    };
  }

  return {
    portrait: withStories([]),
    personNamed: (name) => personByLower.get(name.trim().toLowerCase()),
    storyFor,
    withStories,
  };
}
