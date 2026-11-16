import type { Group, Person, Portrait } from "./types";

export const MOOD_COLORS: Record<string, string> = {
  banter: "#f5b467",
  planning: "#79d3c4",
  chill: "#a8a2ff",
  hype: "#ff7d8c",
  venting: "#e3668a",
  serious: "#8eb4ff",
  wholesome: "#ffc2a8",
  chaotic: "#d8ef72",
};

export const NEBULA_COLORS = ["#7b5cff", "#ff6f91", "#3fb8af", "#f0a04b", "#c45cff", "#5c8dff", "#ff9a5c", "#55d68f"];

/** Topic tags that describe the medium rather than the friendship. */
export const GENERIC_TOPICS = new Set([
  "media", "media sharing", "social media", "instagram", "logistics", "plans", "planning", "meetup", "meetups", "memes", "meme", "reels", "reel",
  "banter", "small talk", "jokes", "joke", "humor", "chat", "group chat", "greetings", "links", "link sharing", "photos", "photo", "video", "videos",
  "messages", "messaging", "attachments", "attachment", "reaction", "reactions", "schedule", "timing", "texting", "scheduling", "coordination", "hangout", "hangouts", "friends", "friendship", "conversation", "inside joke",
]);
export const meaningfulTopics = <T extends [string, number]>(topics: T[]) => topics.filter(([t]) => !GENERIC_TOPICS.has(t.toLowerCase()));

export const moodColor = (mood: string | null | undefined) => MOOD_COLORS[mood ?? ""] ?? "#e9dccb";

/** Weighted message volume per bucket: direct messages count fully, their lines in shared groups count a third. */
export function weightedSeries(p: Person): number[] {
  return p.dmThem.map((n, i) => n + p.dmMe[i] + p.groupThem[i] * 0.35);
}

export function rawSeries(p: Person): number[] {
  return p.dmThem.map((n, i) => n + p.dmMe[i] + p.groupThem[i]);
}

export interface Model {
  data: Portrait;
  person: Map<string, Person>;
  group: Map<string, Group>;
  conversation: Map<string, Portrait["conversations"][number]>;
  story: Map<string, Portrait["stories"][number]>;
  episode: Map<number, Portrait["episodes"][number]>;
  /** Groups small enough to be a circle of friends rather than a broadcast channel. */
  circles: Group[];
  /** Each person's main circle, used to cluster bodies and draw nebulae. */
  circleOf: Map<string, string>;
  now: number;
}

export function buildModel(data: Portrait): Model {
  const person = new Map(data.people.map((p) => [p.id, p]));
  const group = new Map(data.groups.map((g) => [g.id, g]));
  const circles = data.groups.filter((g) => g.members.length >= 2 && g.members.length <= 24 && g.total >= 20);
  const circleOf = new Map<string, string>();
  for (const p of data.people) {
    let best: Group | null = null;
    for (const id of p.groups) {
      const g = group.get(id);
      if (!g || !circles.includes(g)) continue;
      if (!best || g.total / g.members.length > best.total / best.members.length) best = g;
    }
    if (best) circleOf.set(p.id, best.id);
  }
  return {
    data,
    person,
    group,
    conversation: new Map(data.conversations.map((c) => [c.id, c])),
    story: new Map(data.stories.map((s) => [s.person, s])),
    episode: new Map(data.episodes.map((e) => [e.id, e])),
    circles,
    circleOf,
    now: data.timeline.starts[data.timeline.starts.length - 1] + (data.timeline.unit === "week" ? 7 : 31) * 86_400_000,
  };
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtDate = (ts: number) => dateFmt.format(ts);
export const fmtShort = (ts: number) => shortFmt.format(ts);
export const fmtTime = (ts: number) => timeFmt.format(ts);
export const fmtCount = (n: number) => (n >= 10_000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(n)));

export const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** A light tap: forwards to the native shell when embedded, vibrates where the browser supports it. */
export function haptic(style: "light" | "medium" = "light") {
  const w = window as unknown as { webkit?: { messageHandlers?: { haptic?: { postMessage: (s: string) => void } } } };
  w.webkit?.messageHandlers?.haptic?.postMessage(style);
  navigator.vibrate?.(style === "light" ? 6 : 12);
}
