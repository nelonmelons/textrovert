/**
 * Writes fixtures/demo-portrait.json: a fully synthetic portrait with invented people, chats and messages,
 * so the app can be shown and screenshotted without any real data.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Count, EpisodeLite, Group, Person, PlanRef, Portrait, Receipt, Story } from "../src/types";

let seed = 20261115;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const MONTHS = 24;
const start = Date.UTC(2024, 11, 1);
const starts = Array.from({ length: MONTHS }, (_, i) => Date.UTC(2024, 11 + i, 1));
const labels = starts.map((t) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }));
const DAY = 86_400_000;

const NAMES = [
  "Mara Quill", "Theo Lindqvist", "Juniper Okafor", "Ravi Castellanos", "Ines Marlowe", "Oskar Venn", "Lio Brandt", "Saffi Moreau",
  "Dev Aranha", "Wren Halloway", "Kit Navarro", "Pella Ostrova", "Bram Ivers", "Noor Achebe", "Calla Svensen", "Ezra Pembe",
  "Tova Reyes", "Hugo Ferreira", "Anouk Taly", "Felix Oduya", "Rumi Calder", "Sable Ng", "Otto Kasprzak", "Delphine Ruiz",
  "Ade Sorensen", "Yara Winslow", "Moss Delacroix", "Bea Haruka",
];
const MOODS = ["banter", "planning", "chill", "hype", "venting", "serious", "wholesome", "chaotic"] as const;
const TOPICS = ["climbing", "ramen hunts", "film photos", "board games", "job hunt", "road trips", "music festivals", "cooking", "basketball", "housing", "late-night talks", "marathon training", "thrifting", "birthdays"];
const PLACES = ["Joshua Tree", "Little Tokyo", "the bouldering gym", "Seoul", "Big Sur", "the night market", "Lisbon", "the co-op"];

const conversations: Portrait["conversations"] = [];
const people: Person[] = NAMES.map((name, i) => {
  const id = name.toLowerCase().replace(/[^a-z]+/g, "-");
  const born = Math.floor(rand() * (i < 8 ? 6 : 18));
  const peak = born + Math.floor(rand() * (MONTHS - born));
  const scale = 400 / (1 + i * 0.45);
  const fade = rand() < 0.3;
  const curve = (k: number) => {
    if (k < born) return 0;
    const near = Math.exp(-((k - peak) ** 2) / (2 * (3 + rand() * 4) ** 2));
    const tail = fade && k > peak + 4 ? 0.15 : 0.45;
    return Math.round(scale * (near + tail) * (0.6 + rand() * 0.8));
  };
  const hasDm = i < 20;
  const dmThem = starts.map((_, k) => (hasDm ? curve(k) : 0));
  const dmMe = dmThem.map((n) => Math.round(n * (0.7 + rand() * 0.5)));
  const groupThem = starts.map((_, k) => Math.round(curve(k) * 0.6 * rand()));
  if (hasDm) conversations.push({ id: "dm-" + id, title: name, kind: "dm", platform: "instagram", messageCount: dmThem.reduce((s, n) => s + n, 0) * 2 });
  return {
    id, name, platform: "instagram", dmThem, dmMe, groupThem, total: 0, firstTs: starts[born] + Math.floor(rand() * 20) * DAY, lastTs: null,
    dm: hasDm ? "dm-" + id : null, groups: [], episodes: [], plans: [], topics: [], moods: [], places: [], mood: null, closeness: 0,
  };
});

const GROUPS = [
  { title: "sunday crag crew", members: [0, 1, 4, 9, 13, 21] },
  { title: "flat 4B", members: [2, 3, 6, 15] },
  { title: "the ramen council", members: [0, 2, 5, 7, 10, 18, 22] },
  { title: "film club (unofficial)", members: [8, 11, 12, 14, 19, 23, 26] },
  { title: "lisbon or bust", members: [1, 3, 7, 16, 17] },
  { title: "pickup hoops", members: [5, 6, 20, 24, 25, 27] },
];
const groups: Group[] = GROUPS.map((g, gi) => {
  const id = "grp-" + gi;
  const series = starts.map((_, k) => g.members.reduce((s, m) => s + people[m].groupThem[k], 0) + Math.round(rand() * 30));
  for (const m of g.members) people[m].groups.push(id);
  conversations.push({ id, title: g.title, kind: "group", platform: "instagram", messageCount: series.reduce((s, n) => s + n, 0) });
  return { id, title: g.title, platform: "instagram", members: g.members.map((m) => people[m].id), series, total: series.reduce((s, n) => s + n, 0), topics: [] };
});

const receipts: Record<string, Receipt> = {};
let nextMessage = 1000;
const LINES = [
  "ok but hear me out: {place} this weekend",
  "I'm still thinking about that {topic} thing lol",
  "bringing snacks, you bring the speaker",
  "wait are we actually doing this",
  "booked it!!",
  "you were so right about {place}",
  "sending you the photos rn",
  "proud of you fr",
  "can we move it to 7? traffic is unreal",
  "that was the best night in a while",
];
const say = (ts: number, sender: string, conversation: string, topic: string, place: string) => {
  const id = nextMessage++;
  receipts[id] = { id, ts, sender, conversation, text: pick(LINES).replace("{topic}", topic).replace("{place}", place) };
  return id;
};

const episodes: EpisodeLite[] = [];
let nextEpisode = 1;
for (const p of people) {
  const count = Math.max(2, Math.round(14 / (1 + people.indexOf(p) * 0.25)));
  const topicCounts = new Map<string, number>();
  const moodCounts = new Map<string, number>();
  const placeCounts = new Map<string, number>();
  const convId = p.dm ?? p.groups[0];
  const conv = conversations.find((c) => c.id === convId)!;
  for (let k = 0; k < count; k++) {
    const ts = p.firstTs! + Math.floor(rand() * (start + MONTHS * 30 * DAY - p.firstTs!));
    const topic = pick(TOPICS);
    const place = pick(PLACES);
    const mood = pick(MOODS);
    const a = say(ts, p.name, conv.title, topic, place);
    const b = say(ts + 60_000, "Me", conv.title, topic, place);
    const plans: PlanRef[] = [];
    if (rand() < 0.45) {
      const when = new Date(ts + Math.floor(rand() * 20) * DAY).toISOString().slice(0, 10);
      plans.push({ what: pick(["Day trip to ", "Dinner at ", "Climb at ", "Weekend in "]) + place, date: when, when: "said in chat", who: [p.name, "Me"], sources: [a, b], episode: nextEpisode, conversation: conv.id, ts });
    }
    episodes.push({ id: nextEpisode, conversation: conv.id, start: ts, end: ts + 40 * 60_000, title: topic[0].toUpperCase() + topic.slice(1) + " with " + p.name.split(" ")[0], summary: p.name.split(" ")[0] + " and you talk " + topic + " and float a plan around " + place + ".", topics: [topic], people: [p.name, "Me"], mood, kind: "small talk", plans });
    p.episodes.push(nextEpisode++);
    p.plans.push(...plans);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1);
    placeCounts.set(place, (placeCounts.get(place) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number): Count[] => [...m].sort((x, y) => y[1] - x[1]).slice(0, n);
  p.topics = top(topicCounts, 8);
  p.moods = top(moodCounts, 8);
  p.places = top(placeCounts, 6);
  p.mood = p.moods[0][0];
  p.total = [...p.dmThem, ...p.dmMe, ...p.groupThem].reduce((s, n) => s + n, 0);
  const lastK = p.dmThem.map((n, k) => n + p.groupThem[k]).findLastIndex((n) => n > 0);
  p.lastTs = starts[Math.max(0, lastK)] + 12 * DAY;
  p.plans.sort((x, y) => y.ts - x.ts);
}
episodes.sort((a, b) => a.start - b.start);
for (const g of groups) {
  const m = new Map<string, number>();
  for (const id of g.members) for (const [t, n] of people.find((p) => p.id === id)!.topics) m.set(t, (m.get(t) ?? 0) + n);
  g.topics = [...m].sort((x, y) => y[1] - x[1]).slice(0, 6);
}
for (const p of people) {
  const recent = p.dmThem.slice(-6).reduce((s, n, i) => s + (n + p.dmMe[MONTHS - 6 + i]) * (i + 1), 0);
  p.closeness = Math.sqrt(recent) * Math.log1p(p.total);
}
const maxC = Math.max(...people.map((p) => p.closeness));
for (const p of people) p.closeness = Math.round((p.closeness / maxC) * 1000) / 1000;
people.sort((a, b) => b.closeness - a.closeness);

const edges: Portrait["edges"] = [];
for (const g of groups)
  for (let i = 0; i < g.members.length; i++)
    for (let j = i + 1; j < g.members.length; j++) edges.push({ a: g.members[i], b: g.members[j], weight: Math.round((1 + rand() * 4) * 100) / 100 });

const CHAPTERS = [
  ["The first hello", "You met {first} through {group}, trading one-liners about {topic} long before either of you suggested hanging out.", "The first real plan was small: {place}, a late start, nobody in a hurry."],
  ["Finding a rhythm", "By spring the messages came daily, mostly logistics dressed up as jokes.", "You started a running bit about {topic} that never really ended.", "{first} was the one who remembered your birthday without a reminder."],
  ["The big trip", "{place} went from a maybe to a booked weekend in about forty minutes.", "Half the photos are blurry and all of them are good."],
  ["A quieter stretch", "Things slowed down when work got loud, but the check-ins kept coming.", "Even the short messages carried the same warmth."],
  ["Lately", "Now it's plans again: {topic}, {place}, and whatever {first} talks you into next."],
];
const stories: Story[] = people.slice(0, 8).map((p) => {
  const first = p.name.split(" ")[0];
  const g = groups.find((x) => x.id === p.groups[0])?.title ?? "a friend's birthday";
  const topic = p.topics[0]?.[0] ?? "everything";
  const place = p.places[0]?.[0] ?? "somewhere new";
  const conv = conversations.find((c) => c.id === (p.dm ?? p.groups[0]))!.title;
  const chapters = CHAPTERS.slice(0, 3 + Math.floor(rand() * 3)).map(([title, ...sentences], ci) => {
    const t0 = p.firstTs! + ci * 90 * DAY;
    return {
      title,
      period: new Date(t0).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      sentences: sentences.map((s, si) => ({
        text: s.replaceAll("{first}", first).replaceAll("{group}", g).replaceAll("{topic}", topic).replaceAll("{place}", place),
        refs: [say(t0 + si * DAY, si % 2 ? "Me" : p.name, conv, topic, place), say(t0 + si * DAY + 90_000, si % 2 ? p.name : "Me", conv, topic, place)],
      })),
    };
  });
  return { person: p.id, headline: pick(["Two years of plans that actually happened", "The friend who always says yes", "Ramen, rope burns and a lot of voice memos", "From group-chat stranger to first call"]), chapters };
});

const portrait: Portrait = {
  generatedAt: Date.UTC(2026, 10, 15),
  timeZone: "America/Los_Angeles",
  synthetic: true,
  me: { name: "Me", total: people.reduce((s, p) => s + p.dmMe.reduce((a, n) => a + n, 0), 0) },
  timeline: { unit: "month", starts, labels },
  conversations,
  people,
  groups: groups.sort((a, b) => b.total - a.total),
  edges,
  episodes,
  stories,
  receipts,
};
const out = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/demo-portrait.json");
writeFileSync(out, JSON.stringify(portrait, null, 1) + "\n");
console.log("wrote", out);
