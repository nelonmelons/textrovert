import type { ConversationKind, ConversationStats, TextCount } from "../convex/validators";
import type { MessageStore, StoredMessage } from "./store";
import { countUrls, emojis, isLaugh, isTopWordCandidate, words } from "./text";
import type { LocalTime } from "./time";

/** A gap this long starts a new "session"; the first sender of a session initiated it. */
export const SESSION_GAP_MS = 6 * 3_600_000;
/** Same sender again after this long with no reply counts as a double text. */
export const DOUBLE_TEXT_GAP_MS = 20 * 60_000;
/** Upper bounds (seconds) of reply-time buckets. Replies only happen within a session, so they top out at 6 h. */
export const REPLY_BUCKETS_SEC = [30, 60, 120, 300, 600, 1800, 3600, 7200, 14_400, 21_600];

const DAY_MS = 86_400_000;

type AnalyzedMessage = Pick<StoredMessage, "ts" | "sender" | "kind" | "text" | "meta">;

interface ParticipantAcc {
  name: string;
  messages: number;
  words: number;
  media: number;
  emojis: number;
  laughs: number;
  questions: number;
  initiations: number;
  doubleTexts: number;
  lastWords: number;
  replyTimes: number[];
}

class Counter {
  private readonly counts = new Map<string, number>();
  private limit = 50_000;

  add(key: string) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    if (this.counts.size > this.limit) {
      for (const [k, c] of this.counts) if (c <= 1) this.counts.delete(k);
      if (this.counts.size > this.limit / 2) this.limit *= 2;
    }
  }

  top(n: number): TextCount[] {
    return [...this.counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([text, count]) => ({ text, count }));
  }
}

/** Streaming stats for one conversation. Feed messages in chronological order, then call finish() once. */
export class ConversationAnalyzer {
  private readonly people = new Map<string, ParticipantAcc>();
  private readonly hourly = new Array<number>(24).fill(0);
  private readonly weekday = new Array<number>(7).fill(0);
  private readonly myHeatmap = new Array<number>(168).fill(0);
  private readonly monthly = new Map<string, { mine: number; theirs: number }>();
  private readonly myReplyHistogram = new Array<number>(REPLY_BUCKETS_SEC.length).fill(0);
  private readonly theirReplyHistogram = new Array<number>(REPLY_BUCKETS_SEC.length).fill(0);
  private readonly topWords = new Counter();
  private readonly topEmojis = new Counter();
  private readonly myTopWords = new Counter();
  private readonly myTopEmojis = new Counter();
  private readonly models = new Counter();
  private messages = 0;
  private myMessages = 0;
  private links = 0;
  private calls = 0;
  private sessions = 0;
  private responses = 0;
  private firstAt: number | null = null;
  private lastAt: number | null = null;
  private prev: ParticipantAcc | null = null;
  private prevTs = 0;
  private prevIsMe = false;
  private activeDays = 0;
  private lastDay = Number.NaN;
  private streak = 0;
  private longestStreak = 0;
  private longestGap = 0;

  constructor(
    private readonly kind: ConversationKind,
    private readonly selfName: string | null,
    private readonly local: LocalTime,
  ) {}

  add(m: AnalyzedMessage): void {
    if (m.kind === "system") return;
    if (m.kind === "call") {
      this.calls++;
      return;
    }
    const isMe = this.selfName !== null && m.sender === this.selfName;
    const p = this.participant(m.sender);
    const t = this.local.parts(m.ts);

    this.messages++;
    if (isMe) this.myMessages++;
    this.firstAt ??= m.ts;
    this.lastAt = m.ts;
    this.hourly[t.hour]++;
    this.weekday[t.weekday]++;
    if (isMe) this.myHeatmap[t.weekday * 24 + t.hour]++;
    const month = t.year + "-" + String(t.month).padStart(2, "0");
    const monthCounts = this.monthly.get(month) ?? { mine: 0, theirs: 0 };
    if (isMe) monthCounts.mine++;
    else monthCounts.theirs++;
    this.monthly.set(month, monthCounts);
    this.trackDay(t.dayIndex);

    p.messages++;
    if (m.kind === "media") p.media++;
    const aiReply = this.kind === "ai" && !isMe;
    if (aiReply) {
      this.responses++;
      const model = modelOf(m.meta);
      if (model) this.models.add(model);
    } else if (m.text) {
      this.countText(m.text, p, isMe);
    }

    const gap = m.ts - this.prevTs;
    if (!this.prev || gap >= SESSION_GAP_MS) {
      if (this.prev) this.prev.lastWords++;
      this.sessions++;
      p.initiations++;
    } else if (this.prev !== p) {
      p.replyTimes.push(gap / 1000);
      if (isMe) this.myReplyHistogram[bucketOf(gap / 1000)]++;
      else if (this.prevIsMe) this.theirReplyHistogram[bucketOf(gap / 1000)]++;
    } else if (gap >= DOUBLE_TEXT_GAP_MS) {
      p.doubleTexts++;
    }
    this.prev = p;
    this.prevTs = m.ts;
    this.prevIsMe = isMe;
  }

  finish(): ConversationStats {
    if (this.prev) this.prev.lastWords++;
    const participants = [...this.people.values()].sort((a, b) => b.messages - a.messages);
    const me = this.selfName === null ? undefined : this.people.get(this.selfName);
    return {
      messages: this.messages,
      myMessages: this.myMessages,
      firstAt: this.firstAt,
      lastAt: this.lastAt,
      activeDays: this.activeDays,
      longestStreakDays: this.longestStreak,
      longestGapDays: this.longestGap,
      sessions: this.sessions,
      participantCount: participants.length,
      participants: participants.slice(0, 50).map((p) => ({
        name: p.name,
        isMe: p.name === this.selfName,
        messages: p.messages,
        words: p.words,
        media: p.media,
        emojis: p.emojis,
        laughs: p.laughs,
        questions: p.questions,
        initiations: p.initiations,
        doubleTexts: p.doubleTexts,
        lastWords: p.lastWords,
        replies: p.replyTimes.length,
        replyMedianSec: median(p.replyTimes),
      })),
      hourly: this.hourly,
      weekday: this.weekday,
      myHeatmap: this.myHeatmap,
      monthly: [...this.monthly]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .slice(-240)
        .map(([month, counts]) => ({ month, ...counts })),
      myReplyHistogram: this.myReplyHistogram,
      theirReplyHistogram: this.theirReplyHistogram,
      topWords: this.topWords.top(25),
      topEmojis: this.topEmojis.top(12),
      myTopWords: this.myTopWords.top(25),
      myTopEmojis: this.myTopEmojis.top(12),
      links: this.links,
      calls: this.calls,
      ai:
        this.kind === "ai"
          ? {
              prompts: this.myMessages,
              responses: this.responses,
              avgPromptWords: me && me.messages ? Math.round((me.words / me.messages) * 10) / 10 : 0,
              models: this.models.top(5),
            }
          : null,
    };
  }

  private participant(name: string): ParticipantAcc {
    let p = this.people.get(name);
    if (!p) {
      p = { name, messages: 0, words: 0, media: 0, emojis: 0, laughs: 0, questions: 0, initiations: 0, doubleTexts: 0, lastWords: 0, replyTimes: [] };
      this.people.set(name, p);
    }
    return p;
  }

  private countText(text: string, p: ParticipantAcc, isMe: boolean) {
    const tokens = words(text);
    const found = emojis(text);
    p.words += tokens.length;
    p.emojis += found.length;
    if (isLaugh(text)) p.laughs++;
    if (text.includes("?")) p.questions++;
    this.links += countUrls(text);
    for (const word of tokens) {
      if (!isTopWordCandidate(word)) continue;
      this.topWords.add(word);
      if (isMe) this.myTopWords.add(word);
    }
    for (const emoji of found) {
      this.topEmojis.add(emoji);
      if (isMe) this.myTopEmojis.add(emoji);
    }
  }

  private trackDay(day: number) {
    if (day === this.lastDay) return;
    this.activeDays++;
    if (day === this.lastDay + 1) this.streak++;
    else {
      if (!Number.isNaN(this.lastDay)) this.longestGap = Math.max(this.longestGap, day - this.lastDay - 1);
      this.streak = 1;
    }
    this.longestStreak = Math.max(this.longestStreak, this.streak);
    this.lastDay = day;
  }
}

/**
 * 0-100 "how close are you" score for a conversation: volume, reciprocity (how evenly you both talk),
 * recency, and consistency (share of months in its lifetime with messages). Groups count for less.
 */
export function closeness(kind: ConversationKind, stats: ConversationStats, now: number): number {
  if (kind === "ai" || stats.messages === 0 || stats.lastAt === null || stats.firstAt === null) return 0;
  const volume = Math.min(1, Math.log10(1 + stats.messages) / 4);
  const others = stats.messages - stats.myMessages;
  let reciprocity = 0.5;
  if (stats.myMessages > 0 && kind === "dm") reciprocity = 1 - Math.abs(stats.myMessages - others) / stats.messages;
  if (stats.myMessages > 0 && kind === "group") {
    reciprocity = Math.min(1, (stats.myMessages / stats.messages) * Math.max(1, stats.participantCount));
  }
  const recency = Math.exp(-Math.max(0, now - stats.lastAt) / (120 * DAY_MS));
  const spanMonths = Math.max(1, Math.round((stats.lastAt - stats.firstAt) / (30.44 * DAY_MS)) + 1);
  const consistency = Math.min(1, stats.monthly.length / spanMonths);
  const score =
    100 *
    volume *
    (0.35 + 0.65 * reciprocity) *
    (0.25 + 0.75 * recency) *
    (0.5 + 0.5 * consistency) *
    (kind === "group" ? 0.6 : 1);
  return Math.round(score * 10) / 10;
}

export interface AnalysisTarget {
  key: string;
  kind: ConversationKind;
  selfName: string | null;
}

/** Re-reads each conversation's full history from the store and yields its stats. */
export async function* analyzeStoredConversations(
  store: MessageStore,
  owner: string,
  targets: AnalysisTarget[],
  local: LocalTime,
  now: number,
): AsyncGenerator<{ key: string; stats: ConversationStats; closeness: number }> {
  const byKey = new Map(targets.map((t) => [t.key, t]));
  let analyzer: ConversationAnalyzer | null = null;
  for await (const chunk of store.scan(owner, targets.map((t) => t.key))) {
    const target = byKey.get(chunk.conversation)!;
    analyzer ??= new ConversationAnalyzer(target.kind, target.selfName, local);
    for (const message of chunk.messages) analyzer.add(message);
    if (chunk.done) {
      const stats = analyzer.finish();
      yield { key: target.key, stats, closeness: closeness(target.kind, stats, now) };
      analyzer = null;
    }
  }
}

export function medianFromHistogram(histogram: number[]): number | null {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let seen = 0;
  for (let i = 0; i < histogram.length; i++) {
    seen += histogram[i];
    if (seen >= total / 2) {
      const upper = REPLY_BUCKETS_SEC[i];
      return i === 0 ? Math.round(upper / 2) : Math.round(Math.sqrt(REPLY_BUCKETS_SEC[i - 1] * upper));
    }
  }
  return null;
}

function bucketOf(seconds: number): number {
  const i = REPLY_BUCKETS_SEC.findIndex((upper) => seconds <= upper);
  return i === -1 ? REPLY_BUCKETS_SEC.length - 1 : i;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

function modelOf(meta: string | null): string | null {
  if (!meta) return null;
  try {
    const model = (JSON.parse(meta) as { model?: unknown }).model;
    return typeof model === "string" ? model : null;
  } catch {
    return null;
  }
}
