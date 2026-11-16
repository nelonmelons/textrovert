// Wrapped · conversation-specific edition models.
// Instants are epoch milliseconds; durations are seconds. Source messages are expected oldest-first, exactly as imported.

import { addDays, dayDifference, fromWallTime, safeTimeZone, startOfDay, wallTime } from "./time";

export interface WrappedParticipant {
  id: string;
  name: string;
}

export const firstName = (p: WrappedParticipant): string => p.name.split(" ").find((s) => s.length > 0) ?? p.name;

export type WrappedMessageKind = "text" | "system";

export interface WrappedMessage {
  id: string;
  senderID: string | null;
  text: string;
  /** Epoch ms, or null when the source has no time. */
  sentAt: number | null;
  kind?: WrappedMessageKind;
}

export const messageKind = (m: WrappedMessage): WrappedMessageKind => m.kind ?? "text";

export interface WrappedConversation {
  id: string;
  service: string;
  participants: WrappedParticipant[];
  messages: WrappedMessage[];
}

export const isGroup = (c: WrappedConversation): boolean => c.participants.length > 2;
export const participant = (c: WrappedConversation, id: string | null | undefined): WrappedParticipant | undefined =>
  c.participants.find((p) => p.id === id);

/** Whole local days in `timeZone`, with an exclusive end. */
export interface WrappedDateRange {
  start: number;
  end: number;
  timeZone: string;
}

/** Covers whole local days from `firstDay`'s day through `lastDay`'s day. */
export function dateRange(firstDay: number, lastDay: number, timeZone: string): WrappedDateRange {
  const tz = safeTimeZone(timeZone);
  return { start: startOfDay(firstDay, tz), end: addDays(startOfDay(lastDay, tz), 1, tz), timeZone: tz };
}

/** The same range from "YYYY-MM-DD" local dates. */
export function dateRangeFromDays(first: string, through: string, timeZone: string): WrappedDateRange {
  const tz = safeTimeZone(timeZone);
  const midnight = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new Error("Expected a YYYY-MM-DD date, got " + JSON.stringify(s));
    return fromWallTime(tz, Number(m[1]), Number(m[2]), Number(m[3]));
  };
  return { start: midnight(first), end: addDays(midnight(through), 1, tz), timeZone: tz };
}

export const rangeContains = (r: WrappedDateRange, ms: number): boolean => ms >= r.start && ms < r.end;
export const rangeDayCount = (r: WrappedDateRange): number => dayDifference(r.start, r.end, safeTimeZone(r.timeZone));
export const rangeCacheKey = (r: WrappedDateRange): string => `${Math.trunc(r.start / 1000)}-${Math.trunc(r.end / 1000)}`;

export function rangeLabel(r: WrappedDateRange, locale = "en-US"): string {
  const tz = safeTimeZone(r.timeZone);
  const last = r.end - 1000;
  const first = formatDate(r.start, "MMMd", tz, locale);
  const sameMonth = wallTime(r.start, tz).month === wallTime(last, tz).month;
  return `${first} – ${formatDate(last, sameMonth ? "d" : "MMMd", tz, locale)}`;
}

/** The date templates Wrapped uses, rendered like DateFormatter.setLocalizedDateFormatFromTemplate. */
export type WrappedDateTemplate = "MMMd" | "d" | "jmm" | "MMMdjmm";

const templateOptions: Record<WrappedDateTemplate, Intl.DateTimeFormatOptions> = {
  MMMd: { month: "short", day: "numeric" },
  d: { day: "numeric" },
  jmm: { hour: "numeric", minute: "2-digit" },
  MMMdjmm: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
};
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(ms: number, template: WrappedDateTemplate, timeZone: string, locale = "en-US"): string {
  const key = template + "|" + timeZone + "|" + locale;
  let f = dateFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...templateOptions[template], timeZone });
    dateFormatters.set(key, f);
  }
  return f.format(ms);
}

/** "under a minute", "5 minutes", "2 hours 3 min", "1 day 13 hours". */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, seconds);
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (s < 60) return "under a minute";
  if (s < 3600) return unit(Math.trunc(s / 60), "minute");
  if (s < 86400) {
    const hours = Math.trunc(s / 3600);
    const minutes = Math.trunc((s % 3600) / 60);
    return minutes > 0 && hours < 6 ? `${unit(hours, "hour")} ${minutes} min` : unit(hours, "hour");
  }
  const days = Math.trunc(s / 86400);
  const hours = Math.trunc((s % 86400) / 3600);
  return hours > 0 ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day");
}

export type WrappedPresentation = "guess" | "reveal" | "exchange";
export type WrappedSignal =
  | "quotableLine" | "runningJoke" | "datedInvitation" | "lastLineTwist" | "topicChange" | "replyGaps" | "busiestDay" | "warmMoment";
export type WrappedRole = "setup" | "punchline" | "reveal" | "context";

export interface WrappedQuote {
  messageID: string;
  speakerID: string;
  speakerName: string;
  text: string;
  sentAt: number;
  service: string;
}

export interface WrappedHighlightQuote {
  role: WrappedRole;
  quote: WrappedQuote;
}

export interface WrappedQuantity {
  value: string;
  label: string;
  detail: string;
}

export type WrappedFigure =
  | { kind: "none" }
  | { kind: "occurrences"; dates: number[] }
  | { kind: "dailyCounts"; counts: number[]; peak: number; firstDay: number }
  | { kind: "gaps"; seconds: number[] }
  | { kind: "answeredIn"; seconds: number };

export interface WrappedHighlight {
  id: string;
  presentation: WrappedPresentation;
  signal: WrappedSignal;
  headline: string;
  prompt: string;
  why: string;
  quotes: WrappedHighlightQuote[];
  quantity: WrappedQuantity | null;
  figure: WrappedFigure;
  sourceMessageIDs: string[];
  score: number;
  shareByDefault: boolean;
  suggestedByModel?: true;
}

export const isModelSuggestion = (h: WrappedHighlight): boolean => h.suggestedByModel === true;
export const quotesFor = (h: WrappedHighlight, role: WrappedRole): WrappedQuote[] =>
  h.quotes.filter((q) => q.role === role).map((q) => q.quote);

export interface WrappedEdition {
  id: string;
  number: number;
  conversationID: string;
  ownerID: string;
  range: WrappedDateRange;
  generatedAt: number;
  highlights: WrappedHighlight[];
  analyzedMessageCount: number;
  leftOutCount: number;
  isShortRecap: boolean;
}

export const editionSourceIDs = (e: WrappedEdition): Set<string> => new Set(e.highlights.flatMap((h) => h.sourceMessageIDs));

export type WrappedEmptyReason =
  | { kind: "unsupportedConversation" }
  | { kind: "noMessagesInRange"; outsideRange: number }
  | { kind: "noHighlights"; eligibleMessages: number };

export type WrappedOutcome =
  | { kind: "edition"; edition: WrappedEdition }
  | { kind: "exhausted"; seenCount: number; widerRange: WrappedDateRange | null }
  | { kind: "empty"; reason: WrappedEmptyReason; widerRange: WrappedDateRange | null };

/** The literal text that would leave the phone for the selected highlight ids. */
export function buildShareText(
  edition: WrappedEdition,
  selected: ReadonlySet<string>,
  owner: WrappedParticipant,
  friend: WrappedParticipant,
  locale = "en-US",
): string {
  const tz = safeTimeZone(edition.range.timeZone);
  const line = (q: WrappedQuote) => `“${q.text}” — ${q.speakerName}, ${formatDate(q.sentAt, "MMMdjmm", tz, locale)}`;
  const blocks = [`Wrapped: ${firstName(owner)} & ${firstName(friend)} · ${rangeLabel(edition.range, locale)}`];
  for (const h of edition.highlights) {
    if (!selected.has(h.id)) continue;
    const lines = [h.headline];
    switch (h.presentation) {
      case "guess":
        lines.push(...[...quotesFor(h, "setup"), ...quotesFor(h, "reveal")].map(line));
        break;
      case "exchange":
        lines.push(...[...quotesFor(h, "setup"), ...quotesFor(h, "punchline")].map(line));
        break;
      case "reveal":
        if (h.quantity) lines.push(`${h.quantity.value} ${h.quantity.label} · ${h.quantity.detail}`);
        break;
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}
