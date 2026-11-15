import type { ConversationKind, ConversationStats, Insights, Person, Platform, TextCount } from "../convex/validators";
import { medianFromHistogram, REPLY_BUCKETS_SEC } from "./analyze";
import { normalizeName } from "./text";

export interface ConversationSummary {
  key: string;
  platform: Platform;
  kind: ConversationKind;
  title: string;
  selfName: string | null;
  closeness: number;
  stats: ConversationStats | null;
}

const MAX_PEOPLE = 2000;

interface PersonAcc {
  key: string;
  aliases: Map<string, number>;
  platforms: Set<Platform>;
  conversations: { key: string; score: number }[];
  fromThem: number;
  fromMe: number;
  dmMessages: number;
  firstAt: number | null;
  lastAt: number | null;
  theirReplies: [number, number][];
  myReplies: [number, number][];
  initiatedByMe: number;
  initiatedByThem: number;
  closeness: number;
}

/** Merges everyone the user talks to across platforms by normalized name, ranked by closeness. */
export function buildPeople(conversations: ConversationSummary[]): Person[] {
  const people = new Map<string, PersonAcc>();
  for (const c of conversations) {
    const stats = c.stats;
    if (c.kind === "ai" || !stats || stats.messages === 0) continue;
    const me = stats.participants.find((p) => p.isMe);
    const average = stats.messages / Math.max(1, stats.participantCount);
    for (const p of stats.participants) {
      const key = normalizeName(p.name);
      if (p.isMe || !key) continue;
      let acc = people.get(key);
      if (!acc) {
        acc = {
          key,
          aliases: new Map(),
          platforms: new Set(),
          conversations: [],
          fromThem: 0,
          fromMe: 0,
          dmMessages: 0,
          firstAt: null,
          lastAt: null,
          theirReplies: [],
          myReplies: [],
          initiatedByMe: 0,
          initiatedByThem: 0,
          closeness: 0,
        };
        people.set(key, acc);
      }
      acc.aliases.set(p.name, (acc.aliases.get(p.name) ?? 0) + p.messages);
      acc.platforms.add(c.platform);
      acc.fromThem += p.messages;
      acc.firstAt = minNullable(acc.firstAt, stats.firstAt);
      acc.lastAt = maxNullable(acc.lastAt, stats.lastAt);
      if (c.kind === "dm") {
        acc.fromMe += me?.messages ?? 0;
        acc.dmMessages += stats.messages;
        acc.initiatedByMe += me?.initiations ?? 0;
        acc.initiatedByThem += p.initiations;
        if (p.replyMedianSec !== null) acc.theirReplies.push([p.replyMedianSec, p.replies]);
        if (me?.replyMedianSec != null) acc.myReplies.push([me.replyMedianSec, me.replies]);
        acc.closeness = Math.max(acc.closeness, c.closeness);
        acc.conversations.push({ key: c.key, score: 1000 + c.closeness });
      } else {
        acc.closeness = Math.max(acc.closeness, c.closeness * 0.5 * Math.min(1, p.messages / Math.max(1, average)));
        acc.conversations.push({ key: c.key, score: c.closeness });
      }
    }
  }
  return [...people.values()]
    .map((acc): Person => ({
      key: acc.key,
      name: [...acc.aliases].sort((a, b) => b[1] - a[1])[0][0],
      aliases: [...acc.aliases.keys()].slice(0, 10),
      platforms: [...acc.platforms],
      conversationKeys: acc.conversations.sort((a, b) => b.score - a.score).slice(0, 25).map((c) => c.key),
      messages: acc.fromThem + acc.fromMe,
      fromThem: acc.fromThem,
      fromMe: acc.fromMe,
      dmMessages: acc.dmMessages,
      firstAt: acc.firstAt,
      lastAt: acc.lastAt,
      theirReplyMedianSec: weightedMedian(acc.theirReplies),
      myReplyMedianSec: weightedMedian(acc.myReplies),
      initiatedByMe: acc.initiatedByMe,
      initiatedByThem: acc.initiatedByThem,
      closeness: Math.round(Math.min(100, acc.closeness + 5 * (acc.platforms.size - 1)) * 10) / 10,
    }))
    .sort((a, b) => b.closeness - a.closeness || b.messages - a.messages)
    .slice(0, MAX_PEOPLE);
}

/** The user's profile-level insights, aggregated from every analyzed conversation. */
export function buildInsights(conversations: ConversationSummary[], people: Person[], now: number): Insights {
  const analyzed = conversations.filter((c): c is ConversationSummary & { stats: ConversationStats } => c.stats !== null);
  const human = analyzed.filter((c) => c.kind !== "ai");
  const ai = analyzed.filter((c) => c.kind === "ai");

  const heatmap = new Array<number>(168).fill(0);
  const myReplies = new Array<number>(REPLY_BUCKETS_SEC.length).fill(0);
  const theirReplies = new Array<number>(REPLY_BUCKETS_SEC.length).fill(0);
  const monthly = new Map<string, { sent: number; received: number }>();
  const emojiCounts = new Map<string, number>();
  const wordCounts = new Map<string, number>();
  const platforms = new Map<Platform, { platform: Platform; conversations: number; messages: number; sent: number }>();
  const me = { messages: 0, words: 0, emojis: 0, laughs: 0, questions: 0, doubleTexts: 0 };
  let dmSessions = 0;
  let dmInitiations = 0;
  let messages = 0;
  let sent = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;

  for (const c of human) {
    const s = c.stats;
    messages += s.messages;
    sent += s.myMessages;
    firstAt = minNullable(firstAt, s.firstAt);
    lastAt = maxNullable(lastAt, s.lastAt);
    const platform = platforms.get(c.platform) ?? { platform: c.platform, conversations: 0, messages: 0, sent: 0 };
    platform.conversations++;
    platform.messages += s.messages;
    platform.sent += s.myMessages;
    platforms.set(c.platform, platform);
    s.myHeatmap.forEach((n, i) => (heatmap[i] += n));
    for (const m of s.monthly) {
      const bucket = monthly.get(m.month) ?? { sent: 0, received: 0 };
      bucket.sent += m.mine;
      bucket.received += m.theirs;
      monthly.set(m.month, bucket);
    }
    addCounts(emojiCounts, s.myTopEmojis);
    addCounts(wordCounts, s.myTopWords);
    const mine = s.participants.find((p) => p.isMe);
    if (!mine) continue;
    me.messages += mine.messages;
    me.words += mine.words;
    me.emojis += mine.emojis;
    me.laughs += mine.laughs;
    me.questions += mine.questions;
    me.doubleTexts += mine.doubleTexts;
    if (c.kind === "dm") {
      s.myReplyHistogram.forEach((n, i) => (myReplies[i] += n));
      s.theirReplyHistogram.forEach((n, i) => (theirReplies[i] += n));
      dmSessions += s.sessions;
      dmInitiations += mine.initiations;
    }
  }

  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);
  const nightMessages = [0, 1, 2, 3, 4].reduce((sum, hour) => sum + [0, 1, 2, 3, 4, 5, 6].reduce((s, day) => s + heatmap[day * 24 + hour], 0), 0);
  const habits = {
    initiationRate: rate(dmInitiations, dmSessions),
    doubleTextRate: rate(me.doubleTexts, me.messages),
    nightOwlRate: rate(nightMessages, me.messages),
    avgWordsPerMessage: me.messages > 0 ? Math.round((me.words / me.messages) * 10) / 10 : null,
    laughRate: rate(me.laughs, me.messages),
    questionRate: rate(me.questions, me.messages),
    emojiRate: rate(me.emojis, me.messages),
  };
  const reply = {
    myMedianSec: medianFromHistogram(myReplies),
    theirMedianSec: medianFromHistogram(theirReplies),
    myHistogram: myReplies,
    theirHistogram: theirReplies,
  };

  const aiPrompts = ai.reduce((n, c) => n + (c.stats.ai?.prompts ?? 0), 0);
  const aiMonthly = new Map<string, number>();
  for (const c of ai) for (const m of c.stats.monthly) aiMonthly.set(m.month, (aiMonthly.get(m.month) ?? 0) + m.mine);
  const aiPromptWords = ai.reduce((n, c) => n + (c.stats.ai ? c.stats.ai.avgPromptWords * c.stats.ai.prompts : 0), 0);

  return {
    generatedAt: now,
    totals: {
      messages,
      sent,
      received: messages - sent,
      conversations: human.length,
      dms: human.filter((c) => c.kind === "dm").length,
      groups: human.filter((c) => c.kind === "group").length,
      aiChats: ai.length,
      people: people.length,
      firstAt,
      lastAt,
    },
    platforms: [...platforms.values()].sort((a, b) => b.messages - a.messages),
    heatmap,
    monthly: [...monthly]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-240)
      .map(([month, counts]) => ({ month, ...counts })),
    reply,
    habits,
    topEmojis: topCounts(emojiCounts, 12),
    topWords: topCounts(wordCounts, 25),
    topPeople: people.slice(0, 10).map((p) => ({
      key: p.key,
      name: p.name,
      closeness: p.closeness,
      messages: p.messages,
      platforms: p.platforms,
    })),
    archetypes: archetypes(habits, reply.myMedianSec, me.messages, aiPrompts),
    ai:
      ai.length === 0
        ? null
        : {
            prompts: aiPrompts,
            conversations: ai.length,
            avgPromptWords: aiPrompts > 0 ? Math.round((aiPromptWords / aiPrompts) * 10) / 10 : 0,
            monthly: [...aiMonthly].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, prompts]) => ({ month, prompts })),
          },
  };
}

function archetypes(
  h: Insights["habits"],
  myReplySec: number | null,
  myMessages: number,
  aiPrompts: number,
): Insights["archetypes"] {
  const out: Insights["archetypes"] = [];
  const pct = (x: number) => Math.round(x * 100) + "%";
  if (myMessages >= 50) {
    if (h.nightOwlRate !== null && h.nightOwlRate >= 0.12) {
      out.push({ id: "night-owl", label: "Night Owl", reason: pct(h.nightOwlRate) + " of your texts go out between midnight and 5am" });
    }
    if (myReplySec !== null && myReplySec <= 90) {
      out.push({ id: "speed-replier", label: "Speed Replier", reason: "You usually reply within " + duration(myReplySec) });
    }
    if (myReplySec !== null && myReplySec >= 1800) {
      out.push({ id: "slow-burn", label: "Slow Burn", reason: "Your typical reply takes " + duration(myReplySec) });
    }
    if (h.initiationRate !== null && h.initiationRate >= 0.6) {
      out.push({ id: "conversation-starter", label: "Conversation Starter", reason: "You start " + pct(h.initiationRate) + " of your 1:1 conversations" });
    }
    if (h.initiationRate !== null && h.initiationRate <= 0.3) {
      out.push({ id: "in-demand", label: "In Demand", reason: "Other people start " + pct(1 - h.initiationRate) + " of your 1:1 conversations" });
    }
    if (h.doubleTextRate !== null && h.doubleTextRate >= 0.08) {
      out.push({ id: "double-texter", label: "Double Texter", reason: pct(h.doubleTextRate) + " of your texts follow your own unanswered message" });
    }
    if (h.emojiRate !== null && h.emojiRate >= 0.4) {
      out.push({ id: "emoji-maximalist", label: "Emoji Maximalist", reason: h.emojiRate.toFixed(1) + " emojis per message" });
    }
    if (h.avgWordsPerMessage !== null && h.avgWordsPerMessage >= 14) {
      out.push({ id: "novelist", label: "Novelist", reason: h.avgWordsPerMessage + " words per message on average" });
    }
    if (h.avgWordsPerMessage !== null && h.avgWordsPerMessage <= 4) {
      out.push({ id: "short-and-sweet", label: "Short & Sweet", reason: h.avgWordsPerMessage + " words per message on average" });
    }
    if (h.laughRate !== null && h.laughRate >= 0.12) {
      out.push({ id: "easily-amused", label: "Easily Amused", reason: pct(h.laughRate) + " of your messages are some form of lol" });
    }
  }
  if (aiPrompts >= 200) {
    out.push({ id: "ai-power-user", label: "AI Power User", reason: aiPrompts.toLocaleString("en-US") + " prompts sent to AI assistants" });
  }
  return out.slice(0, 5);
}

function duration(seconds: number): string {
  if (seconds < 90) return Math.round(seconds) + " seconds";
  if (seconds < 5400) return Math.round(seconds / 60) + " minutes";
  return Math.round(seconds / 360) / 10 + " hours";
}

function weightedMedian(pairs: [number, number][]): number | null {
  const total = pairs.reduce((n, [, w]) => n + w, 0);
  if (total === 0) return null;
  let seen = 0;
  for (const [value, weight] of [...pairs].sort((a, b) => a[0] - b[0])) {
    seen += weight;
    if (seen >= total / 2) return value;
  }
  return null;
}

function addCounts(into: Map<string, number>, counts: TextCount[]) {
  for (const { text, count } of counts) into.set(text, (into.get(text) ?? 0) + count);
}

function topCounts(counts: Map<string, number>, n: number): TextCount[] {
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([text, count]) => ({ text, count }));
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
