// Analysis context, candidates, reply gaps and the rule-based (heuristic) provider.

import {
  firstName, formatDate, formatElapsed, isGroup, messageKind, participant, rangeContains, rangeDayCount,
  type WrappedConversation, type WrappedDateRange, type WrappedFigure, type WrappedMessage, type WrappedParticipant,
  type WrappedPresentation, type WrappedQuantity, type WrappedRole, type WrappedSignal,
} from "./models";
import { characterCount, compareStrings, content, laughs, normalized, sensitivity, tokens, trimmed, wordCount, type WrappedSensitivity } from "./text";
import { dayDifference, safeTimeZone, startOfDay } from "./time";

export interface WrappedClaim {
  role: WrappedRole;
  messageID: string;
  speakerID: string;
  text: string;
}

export interface WrappedCandidate {
  signal: WrappedSignal;
  presentation: WrappedPresentation;
  headline: string;
  prompt: string;
  why: string;
  claims: WrappedClaim[];
  evidenceIDs: string[];
  quantity: WrappedQuantity | null;
  figure: WrappedFigure;
  score: number;
  shareByDefault: boolean;
  suggestedByModel?: boolean;
}

export interface WrappedReplyGap {
  incomingMessageID: string;
  replyMessageID: string;
  seconds: number;
}

export interface WrappedReplyGapSummary {
  lateGaps: WrappedReplyGap[];
  completedTurns: number;
  openTurns: number;
  skippedForMissingTime: number;
}

export const lateCount = (s: WrappedReplyGapSummary): number => s.lateGaps.length;
export const longestGap = (s: WrappedReplyGapSummary): WrappedReplyGap | undefined =>
  s.lateGaps.reduce<WrappedReplyGap | undefined>((best, g) => (best === undefined || best.seconds < g.seconds ? g : best), undefined);

export interface WrappedEntry {
  index: number;
  message: WrappedMessage;
  date: number | null;
  attributable: boolean;
  inRange: boolean;
  sensitivity: WrappedSensitivity | null;
  tokens: string[];
  content: string[];
  senderID: string;
  usable: boolean;
}

export class WrappedAnalysisContext {
  readonly entries: WrappedEntry[];
  readonly timeZone: string;

  private constructor(
    readonly conversation: WrappedConversation,
    readonly owner: WrappedParticipant,
    readonly friend: WrappedParticipant,
    readonly range: WrappedDateRange,
    readonly locale: string,
  ) {
    this.timeZone = safeTimeZone(range.timeZone);
    const ids = new Set(conversation.participants.map((p) => p.id));
    const friendName = firstName(friend);
    this.entries = conversation.messages
      .filter((m) => messageKind(m) === "text")
      .map((m, index) => {
        const attributable = m.senderID !== null && ids.has(m.senderID) && trimmed(m.text) !== "";
        const date = m.sentAt;
        const inRange = date !== null && rangeContains(range, date);
        const flag = sensitivity(m.text, m.senderID === owner.id, friendName);
        const t = tokens(m.text);
        return {
          index, message: m, date, attributable, inRange, sensitivity: flag, tokens: t, content: content(t),
          senderID: m.senderID ?? "", usable: attributable && inRange && date !== null && flag === null,
        };
      });
  }

  /** Null for groups, conversations that aren't exactly two people, or an owner who isn't a participant. */
  static create(conversation: WrappedConversation, ownerID: string, range: WrappedDateRange, locale = "en-US"): WrappedAnalysisContext | null {
    if (isGroup(conversation) || conversation.participants.length !== 2) return null;
    const owner = participant(conversation, ownerID);
    const friend = conversation.participants.find((p) => p.id !== ownerID);
    if (!owner || !friend) return null;
    return new WrappedAnalysisContext(conversation, owner, friend, range, locale);
  }

  get usable(): WrappedEntry[] {
    return this.entries.filter((e) => e.usable);
  }

  next(e: WrappedEntry): WrappedEntry | undefined {
    return this.entries[e.index + 1];
  }

  previous(e: WrappedEntry): WrappedEntry | undefined {
    return e.index > 0 ? this.entries[e.index - 1] : undefined;
  }

  dayNumber(ms: number): number {
    return dayDifference(startOfDay(this.range.start, this.timeZone), startOfDay(ms, this.timeZone), this.timeZone);
  }

  day(ms: number): string {
    return formatDate(ms, "MMMd", this.timeZone, this.locale);
  }

  clock(ms: number): string {
    return formatDate(ms, "jmm", this.timeZone, this.locale);
  }

  who(id: string, capitalized = false): string {
    return id === this.owner.id ? (capitalized ? "You" : "you") : firstName(this.friend);
  }

  claim(role: WrappedRole, e: WrappedEntry): WrappedClaim {
    return { role, messageID: e.message.id, speakerID: e.senderID, text: e.message.text };
  }

  isShort(e: WrappedEntry, words = 30): boolean {
    return wordCount(e.message.text) <= words && characterCount(e.message.text) <= 160;
  }

  reply(e: WrappedEntry, withinSeconds: number): WrappedEntry | undefined {
    const n = this.next(e);
    if (!n || !n.usable || !e.usable || e.date === null || n.date === null) return undefined;
    if (n.senderID === e.senderID || n.date < e.date || (n.date - e.date) / 1000 > withinSeconds) return undefined;
    return n;
  }
}

export interface WrappedCandidateProviding {
  candidates(context: WrappedAnalysisContext): WrappedCandidate[];
}

/**
 * Completed 24 h+ gaps per incoming turn, last incoming message to first owner reply, both turn start and reply inside the range.
 * Returns null for group or unsupported conversations. Open turns, system messages and messages without times never count.
 */
export function replyGaps(conversation: WrappedConversation, ownerID: string, range: WrappedDateRange): WrappedReplyGapSummary | null {
  if (isGroup(conversation) || conversation.participants.length !== 2 || !participant(conversation, ownerID)) return null;
  const friend = conversation.participants.find((p) => p.id !== ownerID);
  if (!friend) return null;
  const ids = new Set(conversation.participants.map((p) => p.id));
  const late: WrappedReplyGap[] = [];
  let completed = 0, open = 0, skipped = 0;
  let turnStart: number | null = null;
  let turnLast: { date: number; id: string } | null = null;

  const abandonTurn = () => {
    if (turnStart !== null) skipped++;
    turnStart = null;
    turnLast = null;
  };

  for (const m of conversation.messages) {
    if (messageKind(m) !== "text") continue;
    const sender = m.senderID;
    if (sender === null || !ids.has(sender)) { abandonTurn(); continue; }
    const t = m.sentAt;
    if (t === null) { abandonTurn(); continue; }
    if (sender === friend.id) {
      if (turnStart === null) turnStart = t;
      turnLast = { date: t, id: m.id };
      continue;
    }
    const start: number | null = turnStart;
    const last = turnLast as { date: number; id: string } | null;
    if (start === null || last === null) continue;
    if (rangeContains(range, start) && rangeContains(range, t)) {
      completed++;
      const seconds = (t - last.date) / 1000;
      if (seconds >= 86400) late.push({ incomingMessageID: last.id, replyMessageID: m.id, seconds });
    }
    turnStart = null;
    turnLast = null;
  }
  const pending: number | null = turnStart;
  if (pending !== null && rangeContains(range, pending)) open++;
  return { lateGaps: late, completedTurns: completed, openTurns: open, skippedForMissingTime: skipped };
}

const list = (items: string[]): string => {
  const quoted = items.map((s) => `“${s}”`);
  if (quoted.length <= 1) return quoted[0] ?? "";
  return quoted.slice(0, -1).join(", ") + " and " + quoted[quoted.length - 1];
};

const invitePhrases = [
  "you in for", "you in?", "are you free", "are you around", "you around", "want to", "wanna", "do you want", "let's", "lets ", "down to",
  "need a +1", "come with", "join me", "how about", "up for", "come?", "come to",
];
const dayWords = ["tomorrow", "tonight", "today", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend", "next week"];
// ICU semantics: \b uses Unicode word characters and \d any decimal digit, unlike JavaScript's ASCII-only defaults.
const W = String.raw`[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\u200C\u200D]`;
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
const D = String.raw`\p{Nd}`;
const clockPattern = new RegExp(`${B}(at|by|around) ${D}{1,2}(:${D}{2})?${B}|${B}${D}{1,2}(:${D}{2})? ?(am|pm)${B}`, "u");
const acceptTokens = new Set(["yes", "yeah", "yep", "sure", "absolutely", "obviously", "in", "down", "definitely"]);
const twistMarkers = ["turns out", "actually", "the other", "meant", "wrong", "oops", "plot twist", "never mind", "nevermind", "not that"];
const swerveMarkers = ["anyway", "unrelated", "random question", "off topic", "speaking of", "tangent", "out of nowhere"];

const disjoint = (a: Iterable<string>, b: Iterable<string>) => {
  const set = new Set(a);
  for (const x of b) if (set.has(x)) return false;
  return true;
};

export class WrappedHeuristicProvider implements WrappedCandidateProviding {
  candidates(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    return [
      ...this.runningJokes(ctx), ...this.quotableLines(ctx), ...this.invitations(ctx), ...this.lastLineTwists(ctx),
      ...this.topicChanges(ctx), ...this.replyGapCandidates(ctx), ...this.busiestDay(ctx),
    ];
  }

  /** Callbacks across dates: a term that returns on several days. */
  runningJokes(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const usable = ctx.usable;
    if (usable.length < 4) return [];
    const terms = new Map<string, WrappedEntry[]>();
    for (const e of usable) {
      const found = new Set(e.content.filter((t) => characterCount(t) >= 4));
      for (let i = 0; i + 1 < e.content.length; i++) found.add(e.content[i] + " " + e.content[i + 1]);
      for (const t of found) {
        const occ = terms.get(t);
        if (occ) occ.push(e);
        else terms.set(t, [e]);
      }
    }
    const maxDocs = Math.max(8, Math.trunc(usable.length / 3));
    const found: { term: string; occ: WrappedEntry[]; score: number }[] = [];
    for (const [term, occ] of terms) {
      if (occ.length < 3 || occ.length > maxDocs) continue;
      const first = occ[0], last = occ[occ.length - 1];
      if (first.date === null || last.date === null || !ctx.isShort(first) || !ctx.isShort(last)) continue;
      const days = new Set(occ.filter((e) => e.date !== null).map((e) => ctx.dayNumber(e.date!)));
      if (days.size < 2) continue;
      const span = ctx.dayNumber(last.date) - ctx.dayNumber(first.date);
      const both = new Set(occ.map((e) => e.senderID)).size > 1;
      const score = occ.length + Math.min(span, 14) * 0.2 + (both ? 1.5 : 0) + (term.includes(" ") ? 1 : 0);
      found.push({ term, occ, score });
    }
    found.sort((a, b) => (a.score !== b.score ? b.score - a.score : compareStrings(a.term, b.term)));

    const accepted: Set<number>[] = [];
    const result: WrappedCandidate[] = [];
    for (const item of found) {
      const set = new Set(item.occ.map((e) => e.index));
      if (accepted.some((s) => [...s].filter((i) => set.has(i)).length >= 0.5 * Math.min(s.size, set.size))) continue;
      accepted.push(set);
      const first = item.occ[0], last = item.occ[item.occ.length - 1];
      const a = first.date!, b = last.date!;
      const span = ctx.dayNumber(b) - ctx.dayNumber(a);
      const both = new Set(item.occ.map((e) => e.senderID)).size > 1;
      const why =
        `I counted ${item.occ.length} uses over ${span + 1} days: first by ${ctx.who(first.senderID)} on ${ctx.day(a)}, most recently by ${ctx.who(last.senderID)} on ${ctx.day(b)}.` +
        (both ? " You both use it." : "");
      result.push({
        signal: "runningJoke", presentation: "exchange",
        headline: `“${item.term}” keeps coming back`, prompt: "",
        why,
        claims: [ctx.claim("setup", first), ctx.claim("punchline", last)],
        evidenceIDs: item.occ.map((e) => e.message.id),
        quantity: { value: String(item.occ.length), label: "times", detail: `over ${span + 1} days` },
        figure: { kind: "occurrences", dates: item.occ.filter((e) => e.date !== null).map((e) => e.date!) },
        score: item.score, shareByDefault: true,
      });
    }
    return result;
  }

  /** A short, distinctive line with an unambiguous sender, followed by a reply. */
  quotableLines(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const usable = ctx.usable;
    const df = new Map<string, number>();
    for (const e of usable) for (const t of new Set(e.content)) df.set(t, (df.get(t) ?? 0) + 1);
    const result: WrappedCandidate[] = [];
    for (const e of usable) {
      const words = wordCount(e.message.text);
      if (words < 3 || words > 14 || characterCount(e.message.text) > 120 || e.content.length < 2) continue;
      const reply = ctx.reply(e, 86400);
      if (!reply || e.date === null || reply.date === null) continue;
      const a = e.date, b = reply.date;
      const unique = e.content.filter((t) => df.get(t) === 1);
      const fraction = unique.length / e.content.length;
      if (unique.length === 0 || fraction < 0.5) continue;
      if (!laughs(reply.message.text)) continue;
      const score = 1 + 3 * fraction + Math.min(unique.length, 3) * 0.4 + 1.5 + (words <= 8 ? 0.5 : 0);
      const shown = unique.slice(0, 2);
      const elapsed = formatElapsed((b - a) / 1000);
      const why = `I couldn’t find ${list(shown).replaceAll(" and ", " or ")} in any other message in this range, and ${ctx.who(reply.senderID)} replied ${elapsed} later.`;
      result.push({
        signal: "quotableLine", presentation: "guess",
        headline: "Who said it?", prompt: `${firstName(ctx.owner)} or ${firstName(ctx.friend)}?`,
        why,
        claims: [ctx.claim("setup", e), ctx.claim("reveal", reply)],
        evidenceIDs: [e.message.id, reply.message.id],
        quantity: null, figure: { kind: "answeredIn", seconds: (b - a) / 1000 },
        score, shareByDefault: true,
      });
    }
    return result;
  }

  /** A memorable, dated invitation and its reply. */
  invitations(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const result: WrappedCandidate[] = [];
    for (const e of ctx.usable) {
      const n = normalized(e.message.text);
      if (!invitePhrases.some((p) => n.includes(p)) || !ctx.isShort(e)) continue;
      const nTokens = tokens(n);
      const cue = dayWords.find((w) => nTokens.includes(w) || n.includes(w));
      if (cue === undefined) continue;
      const reply = ctx.reply(e, 86400);
      if (!reply || !ctx.isShort(reply) || e.date === null || reply.date === null) continue;
      const a = e.date, b = reply.date;
      const clock = clockPattern.test(n);
      const accepted = reply.tokens.some((t) => acceptTokens.has(t));
      const score = 2 + (clock ? 0.7 : 0) + (accepted ? 1 : 0) + (wordCount(reply.message.text) <= 10 ? 0.5 : 0) + (laughs(reply.message.text) ? 0.8 : 0);
      const elapsed = formatElapsed((b - a) / 1000);
      result.push({
        signal: "datedInvitation", presentation: "exchange",
        headline: `${ctx.who(e.senderID, true)} made a plan`,
        prompt: "",
        why: `I spotted a plan for “${cue}” on ${ctx.day(a)}, and ${ctx.who(reply.senderID)} answered ${elapsed} later.`,
        claims: [ctx.claim("setup", e), ctx.claim("punchline", reply)],
        evidenceIDs: [e.message.id, reply.message.id],
        quantity: null, figure: { kind: "answeredIn", seconds: (b - a) / 1000 },
        score, shareByDefault: true,
      });
    }
    return result;
  }

  /** The last line recasts the first: statement, question, answer with a correction. */
  lastLineTwists(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const all = ctx.entries;
    const result: WrappedCandidate[] = [];
    for (let i = 0; i < Math.max(0, all.length - 2); i++) {
      const a = all[i], b = all[i + 1], c = all[i + 2];
      if (!a.usable || !b.usable || !c.usable || a.date === null || c.date === null) continue;
      const ta = a.date, tc = c.date;
      if (a.senderID === b.senderID || c.senderID !== a.senderID || !b.message.text.includes("?") || tc < ta || (tc - ta) / 1000 > 1800) continue;
      if (!ctx.isShort(a) || !ctx.isShort(b) || !ctx.isShort(c)) continue;
      const n = normalized(c.message.text);
      const marker = twistMarkers.find((m) => n.includes(m));
      if (marker === undefined) continue;
      const elapsed = formatElapsed((tc - ta) / 1000);
      result.push({
        signal: "lastLineTwist", presentation: "exchange",
        headline: "The last line changes it", prompt: "",
        why: `I think “${marker}” in the last line changes what the first one meant. All three texts landed within ${elapsed}.`,
        claims: [ctx.claim("setup", a), ctx.claim("punchline", b), ctx.claim("punchline", c)],
        evidenceIDs: [a.message.id, b.message.id, c.message.id],
        quantity: null, figure: { kind: "answeredIn", seconds: (tc - ta) / 1000 },
        score: 3.4 + (laughs(c.message.text) ? 0.5 : 0), shareByDefault: true,
      });
    }
    return result;
  }

  /** An improbable topic change: no word from the previous message returns. */
  topicChanges(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const result: WrappedCandidate[] = [];
    for (const e of ctx.entries) {
      if (!e.usable) continue;
      const prev = ctx.previous(e);
      if (!prev || !prev.usable || prev.date === null || e.date === null) continue;
      const tp = prev.date, te = e.date;
      if (te < tp || (te - tp) / 1000 > 6 * 3600 || !ctx.isShort(prev) || !ctx.isShort(e)) continue;
      const n = normalized(e.message.text);
      const marker = swerveMarkers.find((m) => n.includes(m));
      if (marker === undefined || !disjoint(prev.content, e.content)) continue;
      const replied = ctx.reply(e, 3600) !== undefined;
      result.push({
        signal: "topicChange", presentation: "exchange",
        headline: "Out of nowhere", prompt: "",
        why: `I can’t find a single word from the text before in this one, and ${ctx.who(e.senderID)} opened with “${marker}”.`,
        claims: [ctx.claim("setup", prev), ctx.claim("punchline", e)],
        evidenceIDs: [prev.message.id, e.message.id],
        quantity: null, figure: { kind: "answeredIn", seconds: (te - tp) / 1000 },
        score: 4.6 + (replied ? 0.6 : 0), shareByDefault: true,
      });
    }
    return result;
  }

  /** The owner's own completed 24 h+ reply gaps. Private unless explicitly selected. */
  replyGapCandidates(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const summary = replyGaps(ctx.conversation, ctx.owner.id, ctx.range);
    if (!summary || lateCount(summary) < 2) return [];
    const longest = longestGap(summary)!;
    const byID = new Map<string, WrappedEntry>();
    for (const e of ctx.entries) if (!byID.has(e.message.id)) byID.set(e.message.id, e);
    const shown = [...summary.lateGaps].sort((a, b) => b.seconds - a.seconds).slice(0, 3).sort((a, b) => a.seconds - b.seconds);
    const claims: WrappedClaim[] = [];
    for (const gap of shown) {
      const incoming = byID.get(gap.incomingMessageID), reply = byID.get(gap.replyMessageID);
      if (!incoming || !reply) continue;
      claims.push(ctx.claim("context", incoming), ctx.claim("reveal", reply));
    }
    const n = lateCount(summary);
    return [{
      signal: "replyGaps", presentation: "reveal",
      headline: "Your ghost era?", prompt: `How many times did you answer ${firstName(ctx.friend)} a day or more later?`,
      why: `I counted ${n} of ${summary.completedTurns} replies that came 24 hours or more later. I’m only measuring time, so I can’t tell whether anything was ignored.`,
      claims,
      evidenceIDs: summary.lateGaps.flatMap((g) => [g.incomingMessageID, g.replyMessageID]),
      quantity: { value: String(n), label: n === 1 ? "late comeback" : "late comebacks", detail: `Longest gap: ${formatElapsed(longest.seconds)}` },
      figure: { kind: "gaps", seconds: summary.lateGaps.map((g) => g.seconds) },
      score: 4 + Math.min(n, 5) * 0.3, shareByDefault: false,
    }];
  }

  /** The day with the most messages, counted from timestamps. */
  busiestDay(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const byDay = new Map<number, WrappedEntry[]>();
    for (const e of ctx.usable) {
      if (e.date === null) continue;
      const d = ctx.dayNumber(e.date);
      const items = byDay.get(d);
      if (items) items.push(e);
      else byDay.set(d, [e]);
    }
    let peak: [number, WrappedEntry[]] | undefined;
    for (const entry of byDay) {
      if (!peak || entry[1].length > peak[1].length || (entry[1].length === peak[1].length && entry[0] < peak[0])) peak = entry;
    }
    if (!peak || peak[1].length < 6) return [];
    const first = peak[1][0], last = peak[1][peak[1].length - 1];
    if (first.message.id === last.message.id || first.date === null || last.date === null) return [];
    const a = first.date, b = last.date;
    const counts = new Array<number>(Math.max(rangeDayCount(ctx.range), 1)).fill(0);
    for (const [d, items] of byDay) if (d >= 0 && d < counts.length) counts[d] = items.length;
    const active = counts.filter((c) => c > 0).sort((x, y) => x - y);
    const median = active[Math.trunc(active.length / 2)];
    return [{
      signal: "busiestDay", presentation: "reveal",
      headline: "Your loudest day", prompt: "Which day did the two of you text the most?",
      why: `I counted ${peak[1].length} messages on ${ctx.day(a)} from the timestamps. A typical active day had ${median}.`,
      claims: [ctx.claim("context", first), ctx.claim("context", last)],
      evidenceIDs: peak[1].map((e) => e.message.id),
      quantity: { value: String(peak[1].length), label: "messages", detail: `on ${ctx.day(a)}, ${ctx.clock(a)} to ${ctx.clock(b)}` },
      figure: { kind: "dailyCounts", counts, peak: peak[0], firstDay: ctx.range.start },
      score: 3.0, shareByDefault: true,
    }];
  }
}
