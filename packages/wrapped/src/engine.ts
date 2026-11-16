// Engine: quote verification, selection and caching-friendly generation.

import {
  WrappedAnalysisContext, WrappedHeuristicProvider, replyGaps,
  type WrappedCandidate, type WrappedCandidateProviding, type WrappedClaim,
} from "./analysis";
import {
  isModelSuggestion, messageKind, participant, rangeCacheKey, rangeContains, rangeDayCount,
  type WrappedConversation, type WrappedDateRange, type WrappedEdition, type WrappedHighlight, type WrappedHighlightQuote,
  type WrappedOutcome, type WrappedPresentation, type WrappedQuote, type WrappedRole,
} from "./models";
import { compareStrings } from "./text";
import { addDays, safeTimeZone, startOfDay } from "./time";

/** Resolves a claim to its one source message: id, speaker, exact text, time inside the range, and text kind. */
export function resolve(claim: WrappedClaim, conversation: WrappedConversation, range: WrappedDateRange): WrappedQuote | null {
  const matches = conversation.messages.filter((m) => m.id === claim.messageID);
  if (matches.length !== 1) return null;
  const m = matches[0];
  if (messageKind(m) !== "text" || m.senderID === null || m.senderID !== claim.speakerID) return null;
  const person = participant(conversation, m.senderID);
  if (!person || m.sentAt === null || !rangeContains(range, m.sentAt)) return null;
  if (claim.text === "" || !m.text.includes(claim.text)) return null;
  return { messageID: m.id, speakerID: m.senderID, speakerName: person.name, text: claim.text, sentAt: m.sentAt, service: conversation.service };
}

export function highlight(c: WrappedCandidate, conversation: WrappedConversation, range: WrappedDateRange): WrappedHighlight | null {
  const quotes: WrappedHighlightQuote[] = [];
  for (const claim of c.claims) {
    const q = resolve(claim, conversation, range);
    if (!q) return null;
    quotes.push({ role: claim.role, quote: q });
  }
  for (const id of c.evidenceIDs) {
    const m = conversation.messages.filter((x) => x.id === id);
    if (m.length !== 1 || messageKind(m[0]) !== "text" || m[0].sentAt === null || !rangeContains(range, m[0].sentAt)) return null;
    if (!participant(conversation, m[0].senderID)) return null;
  }
  const count = (role: WrappedRole) => quotes.filter((q) => q.role === role).length;
  switch (c.presentation) {
    case "guess": {
      const a = quotes.find((q) => q.role === "setup")?.quote, b = quotes.find((q) => q.role === "reveal")?.quote;
      if (count("setup") !== 1 || count("reveal") !== 1 || !a || !b || a.speakerID === b.speakerID || b.sentAt < a.sentAt) return null;
      break;
    }
    case "exchange":
      if (count("setup") < 1 || count("punchline") < 1 || count("punchline") > 2) return null;
      break;
    case "reveal":
      if (quotes.length === 0 && c.quantity === null) return null;
      break;
  }
  const sources = [...new Set([...c.claims.map((x) => x.messageID), ...c.evidenceIDs])];
  const h: WrappedHighlight = {
    id: c.signal + ":" + c.claims.map((x) => x.messageID).join("+"),
    presentation: c.presentation, signal: c.signal, headline: c.headline, prompt: c.prompt, why: c.why,
    quotes, quantity: c.quantity, figure: c.figure, sourceMessageIDs: sources, score: c.score, shareByDefault: c.shareByDefault,
  };
  if (c.suggestedByModel) h.suggestedByModel = true;
  return h;
}

const presentationOrder: Record<WrappedPresentation, number> = { guess: 0, reveal: 1, exchange: 2 };

/**
 * Up to three highlights: distinct signals first, never sharing a source message.
 * At most `maxModel` may come from the model, and a fresh rule-based highlight is always kept when one exists.
 */
export function select(items: WrappedHighlight[], maxModel = 2): WrappedHighlight[] {
  const pool = items
    .filter((h) => h.score >= 2.0)
    .sort((a, b) => (a.score !== b.score ? b.score - a.score : compareStrings(a.id, b.id)));
  let chosen: WrappedHighlight[] = [];
  const sources = new Set<string>();
  const signals = new Set<string>();
  for (let pass = 0; pass < 2; pass++) {
    for (const h of pool) {
      if (chosen.length >= 3) continue;
      const fresh = h.sourceMessageIDs.every((id) => !sources.has(id));
      const distinct = !signals.has(h.signal);
      const modelRoom = !isModelSuggestion(h) || chosen.filter(isModelSuggestion).length < maxModel;
      if (!fresh || !modelRoom || !((pass === 0 && distinct) || (pass === 1 && !distinct && h.score >= 3.0))) continue;
      chosen.push(h);
      for (const id of h.sourceMessageIDs) sources.add(id);
      signals.add(h.signal);
    }
  }
  if (chosen.length > 0 && chosen.every(isModelSuggestion)) {
    const kept = chosen.length < 3 ? chosen : chosen.slice(0, -1);
    const used = new Set(kept.flatMap((h) => h.sourceMessageIDs));
    const rule = pool.find((h) => !isModelSuggestion(h) && h.sourceMessageIDs.every((id) => !used.has(id)));
    if (rule) chosen = [...kept, rule];
  }
  return chosen.sort((a, b) =>
    presentationOrder[a.presentation] !== presentationOrder[b.presentation]
      ? presentationOrder[a.presentation] - presentationOrder[b.presentation]
      : b.score - a.score,
  );
}

/** One more range length on each side, clamped to the conversation's text messages; or their full extent. */
export function widerRange(conversation: WrappedConversation, range: WrappedDateRange, toFullExtent = false): WrappedDateRange | null {
  const dates = conversation.messages.filter((m) => messageKind(m) === "text" && m.sentAt !== null).map((m) => m.sentAt!);
  if (dates.length === 0) return null;
  const lo = dates.reduce((a, b) => Math.min(a, b)), hi = dates.reduce((a, b) => Math.max(a, b));
  const tz = safeTimeZone(range.timeZone);
  const days = Math.max(rangeDayCount(range), 1);
  const earliest = startOfDay(lo, tz);
  const latestEnd = addDays(startOfDay(hi, tz), 1, tz);
  const start = toFullExtent ? earliest : Math.max(earliest, addDays(range.start, -days, tz));
  const end = toFullExtent ? latestEnd : Math.min(latestEnd, addDays(range.end, days, tz));
  const newStart = Math.min(start, range.start), newEnd = Math.max(end, range.end);
  if (!(newStart < range.start || newEnd > range.end)) return null;
  return { start: newStart, end: newEnd, timeZone: range.timeZone };
}

export interface GenerateOptions {
  conversation: WrappedConversation;
  ownerID: string;
  range: WrappedDateRange;
  /** Source message ids used by earlier editions; a new edition never reuses them. */
  avoiding?: Iterable<string>;
  number?: number;
  now?: number;
  locale?: string;
  provider?: WrappedCandidateProviding;
}

export function generate(options: GenerateOptions): WrappedOutcome {
  const { conversation, ownerID, range, number = 1, now = Date.now(), locale = "en-US" } = options;
  const seen = new Set(options.avoiding ?? []);
  const provider = options.provider ?? new WrappedHeuristicProvider();
  const ctx = WrappedAnalysisContext.create(conversation, ownerID, range, locale);
  if (!ctx) return { kind: "empty", reason: { kind: "unsupportedConversation" }, widerRange: null };
  const wider = widerRange(conversation, range);
  const eligible = ctx.entries.filter((e) => e.attributable && e.inRange && e.date !== null);
  if (eligible.length === 0) {
    return { kind: "empty", reason: { kind: "noMessagesInRange", outsideRange: ctx.entries.length }, widerRange: widerRange(conversation, range, true) };
  }
  const verified = provider
    .candidates(ctx)
    .map((c) => highlight(c, conversation, range))
    .filter((h): h is WrappedHighlight => h !== null && h.sourceMessageIDs.every((id) => !seen.has(id)));
  const chosen = select(verified);
  if (chosen.length === 0) {
    return seen.size === 0
      ? { kind: "empty", reason: { kind: "noHighlights", eligibleMessages: eligible.length }, widerRange: wider }
      : { kind: "exhausted", seenCount: seen.size, widerRange: wider };
  }
  return {
    kind: "edition",
    edition: {
      id: `${ownerID}|${conversation.id}|${rangeCacheKey(range)}#${number}`, number,
      conversationID: conversation.id, ownerID, range, generatedAt: now,
      highlights: chosen, analyzedMessageCount: eligible.length,
      leftOutCount: eligible.filter((e) => e.sensitivity !== null).length,
      isShortRecap: eligible.length < 12,
    },
  };
}

/** Re-checks every cached quote against the current conversation. Highlights whose source changed or vanished are dropped. */
export function revalidate(edition: WrappedEdition, conversation: WrappedConversation): WrappedEdition {
  const kept = edition.highlights.filter((h) =>
    h.quotes.every((hq) =>
      resolve({ role: hq.role, messageID: hq.quote.messageID, speakerID: hq.quote.speakerID, text: hq.quote.text }, conversation, edition.range) !== null,
    ),
  );
  return { ...edition, highlights: kept };
}

export const WrappedEngine = { resolve, highlight, select, widerRange, generate, revalidate, replyGaps };
