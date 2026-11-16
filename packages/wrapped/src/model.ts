// Model layer for Wrapped. A model may only point at message ids; every quote it leads to is re-read from the
// source message and passes the same verification, privacy filter and selection as rule-based highlights.

import {
  WrappedAnalysisContext, WrappedHeuristicProvider,
  type WrappedCandidate, type WrappedCandidateProviding, type WrappedEntry,
} from "./analysis";
import { firstName, formatDate, type WrappedConversation, type WrappedDateRange, type WrappedFigure, type WrappedPresentation, type WrappedQuantity, type WrappedSignal } from "./models";
import type { WrappedStorage } from "./store";
import { characterCount, sensitivity, tokens, trimmed, wordCount } from "./text";

/** Settings Emma has not decided yet. Defaults: funny moments only, affectionate teasing off. */
export interface WrappedModelOptions {
  includeWarmMoments: boolean;
  allowAffectionateTeasing: boolean;
}

export const defaultModelOptions = (): WrappedModelOptions => ({ includeWarmMoments: false, allowAffectionateTeasing: false });

export const modelOptionKeys = {
  includeWarmMoments: "textrovert.wrapped.includeWarmMoments",
  allowAffectionateTeasing: "textrovert.wrapped.allowAffectionateTeasing",
} as const;

/** Reads both settings; anything but a stored `true` is false. */
export async function storedModelOptions(storage: WrappedStorage): Promise<WrappedModelOptions> {
  const [warm, teasing] = await Promise.all([storage.getItem(modelOptionKeys.includeWarmMoments), storage.getItem(modelOptionKeys.allowAffectionateTeasing)]);
  return { includeWarmMoments: warm === "true", allowAffectionateTeasing: teasing === "true" };
}

export async function storeModelOptions(storage: WrappedStorage, options: WrappedModelOptions): Promise<void> {
  await Promise.all([
    storage.setItem(modelOptionKeys.includeWarmMoments, String(options.includeWarmMoments)),
    storage.setItem(modelOptionKeys.allowAffectionateTeasing, String(options.allowAffectionateTeasing)),
  ]);
}

export const wrappedModelKinds = ["callback", "quotable", "twist", "swerve", "plan", "warm"] as const;
export type WrappedModelKind = (typeof wrappedModelKinds)[number];

/** What a model returns: references and short framing only, never quote text. */
export interface WrappedModelSuggestion {
  kind: string;
  messageIDs: string[];
  headline: string;
  why: string;
  sensitive: boolean;
}

export interface WrappedModelPrompt {
  instructions: string;
  chunks: string[];
  messageIDs: Set<string>;
}

export interface ModelPromptOptions {
  conversation: WrappedConversation;
  ownerID: string;
  range: WrappedDateRange;
  avoiding?: Iterable<string>;
  options?: WrappedModelOptions;
  locale?: string;
  chunkCharacters?: number;
  maxChunks?: number;
}

/**
 * Only attributable, dated, in-range messages not used by an earlier edition. Messages the privacy filter flags are
 * never sent, except affectionate teasing when that setting is on. Null for groups and when nothing is eligible.
 */
export function makeModelPrompt(args: ModelPromptOptions): WrappedModelPrompt | null {
  const { conversation, ownerID, range, locale = "en-US", chunkCharacters = 4000, maxChunks = 3 } = args;
  const options = args.options ?? defaultModelOptions();
  const seen = new Set(args.avoiding ?? []);
  const ctx = WrappedAnalysisContext.create(conversation, ownerID, range, locale);
  if (!ctx) return null;
  const entries = ctx.entries.filter(
    (e) =>
      e.attributable && e.inRange && e.date !== null && !seen.has(e.message.id) &&
      (e.sensitivity === null || (options.allowAffectionateTeasing && e.sensitivity === "roastOfOther")),
  );
  if (entries.length === 0) return null;
  const friend = firstName(ctx.friend);
  const chunks: string[] = [];
  let current = "";
  for (const e of entries) {
    const speaker = e.senderID === ctx.owner.id ? "You" : friend;
    const line = `${e.message.id} | ${speaker} | ${formatDate(e.date!, "MMMdjmm", ctx.timeZone, locale)} | ${e.message.text.replaceAll("\n", " ")}\n`;
    if (current !== "" && characterCount(current) + characterCount(line) > chunkCharacters) {
      chunks.push(current);
      current = "";
      if (chunks.length === maxChunks) break;
    }
    current += line;
  }
  if (current !== "" && chunks.length < maxChunks) chunks.push(current);
  const kinds = wrappedModelKinds.filter((k) => k !== "warm" || options.includeWarmMoments).join(", ");
  const instructions =
    `You help make a playful recap of a text conversation between "You" and ${friend}. ` +
    `Each line is: message id | speaker | time | text. Find up to 4 standout moments. ` +
    `Allowed kinds: ${kinds}. callback: the same joke or object returning on different days, possibly in different words (2–4 ids). ` +
    `quotable: a short memorable line and the other person's direct reply (2 ids). ` +
    `twist: a line, a reply, and a last line that changes the meaning of the first (3 ids). ` +
    `swerve: an abrupt change of subject (2 ids: before and after). ` +
    `plan: an invitation with a day or time and its answer (2 ids)${options.includeWarmMoments ? ". warm: a kind or sentimental exchange (2 ids)" : ""}. ` +
    `Use only ids that appear in the lines, in time order. Never copy or rewrite message text. ` +
    `The headline is at most 6 words. The why is one short sentence about what makes it distinctive. ` +
    `Set sensitive to true for anything about conflict, hurt feelings, health, money, or private details, or anything that mocks someone.`;
  return { instructions, chunks, messageIDs: new Set(entries.map((e) => e.message.id)) };
}

export interface WrappedModelSource {
  suggestions(prompt: WrappedModelPrompt, signal?: AbortSignal): Promise<WrappedModelSuggestion[]>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Fixed suggestions, for tests and the deterministic demo route. */
export class WrappedStubModelSource implements WrappedModelSource {
  constructor(
    readonly fixed: WrappedModelSuggestion[],
    readonly delayMs = 0,
  ) {}
  async suggestions(): Promise<WrappedModelSuggestion[]> {
    if (this.delayMs > 0) await sleep(this.delayMs);
    return this.fixed;
  }
}

const blockedHeadlineWords = new Set(["fuck", "shit", "bitch", "ass", "damn", "crap", "dick", "slut", "whore"]);

/** Turns model suggestions into candidates. Anything that fails a check is dropped, never repaired. */
export class WrappedSuggestionProvider implements WrappedCandidateProviding {
  constructor(
    readonly suggestions: WrappedModelSuggestion[],
    readonly options: WrappedModelOptions = defaultModelOptions(),
  ) {}

  candidates(ctx: WrappedAnalysisContext): WrappedCandidate[] {
    const byID = new Map<string, WrappedEntry>();
    for (const e of ctx.entries) if (!byID.has(e.message.id)) byID.set(e.message.id, e);
    const seenSets = new Set<string>();
    const result: WrappedCandidate[] = [];
    for (const s of this.suggestions) {
      const kind = s.kind.toLowerCase() as WrappedModelKind;
      if (s.sensitive || !wrappedModelKinds.includes(kind) || (kind === "warm" && !this.options.includeWarmMoments)) continue;
      const setKey = JSON.stringify(s.messageIDs);
      if (seenSets.has(setKey)) continue;
      seenSets.add(setKey);
      const entries = s.messageIDs.map((id) => byID.get(id)).filter((e): e is WrappedEntry => e !== undefined);
      if (entries.length !== s.messageIDs.length || new Set(s.messageIDs).size !== s.messageIDs.length) continue;
      if (!entries.every((e) => this.eligible(e))) continue;
      if (!entries.every((e, i) => i === 0 || entries[i - 1].date! <= e.date!)) continue;
      const headline = trimmed(s.headline);
      const why = trimmed(s.why);
      if (headline === "" || characterCount(headline) > 48 || wordCount(headline) > 6) continue;
      if (tokens(headline).some((t) => blockedHeadlineWords.has(t))) continue;
      if (sensitivity(headline, false, firstName(ctx.friend)) !== null || characterCount(why) > 200) continue;
      const c = this.candidate(kind, entries, headline, "", ctx);
      if (c) result.push(c);
    }
    return result;
  }

  private eligible(e: WrappedEntry): boolean {
    if (!e.attributable || !e.inRange || e.date === null) return false;
    if (e.sensitivity === null) return true;
    return this.options.allowAffectionateTeasing && e.sensitivity === "roastOfOther";
  }

  private candidate(kind: WrappedModelKind, e: WrappedEntry[], headline: string, why: string, ctx: WrappedAnalysisContext): WrappedCandidate | null {
    const first = e[0], last = e[e.length - 1];
    const span = (last.date! - first.date!) / 1000;
    const ids = e.map((x) => x.message.id);
    const make = (
      signal: WrappedSignal, presentation: WrappedPresentation, claims: WrappedCandidate["claims"], figure: WrappedFigure, score: number,
      prompt = "", quantity: WrappedQuantity | null = null,
    ): WrappedCandidate => ({
      signal, presentation, headline, prompt, why, claims, evidenceIDs: ids, quantity, figure, score, shareByDefault: true, suggestedByModel: true,
    });
    const answered: WrappedFigure = { kind: "answeredIn", seconds: span };
    const differentSpeakers = first.senderID !== last.senderID;
    switch (kind) {
      case "callback": {
        const days = new Set(e.map((x) => ctx.dayNumber(x.date!)));
        if (e.length < 2 || e.length > 4 || days.size < 2) return null;
        const dayCount = ctx.dayNumber(last.date!) - ctx.dayNumber(first.date!) + 1;
        return make("runningJoke", "exchange", [ctx.claim("setup", first), ctx.claim("punchline", last)],
          { kind: "occurrences", dates: e.map((x) => x.date!) }, 3.0 + e.length * 0.1, "",
          { value: String(e.length), label: "times", detail: `over ${dayCount} days` });
      }
      case "quotable":
        if (e.length !== 2 || !differentSpeakers || span > 86400) return null;
        return make("quotableLine", "guess", [ctx.claim("setup", first), ctx.claim("reveal", last)], answered, 3.1,
          `${firstName(ctx.owner)} or ${firstName(ctx.friend)}?`);
      case "twist":
        if (e.length !== 3 || first.senderID === e[1].senderID || span > 6 * 3600) return null;
        return make("lastLineTwist", "exchange", [ctx.claim("setup", first), ctx.claim("punchline", e[1]), ctx.claim("punchline", last)], answered, 3.0);
      case "swerve":
        if (e.length !== 2 || span > 6 * 3600) return null;
        return make("topicChange", "exchange", [ctx.claim("setup", first), ctx.claim("punchline", last)], answered, 3.0);
      case "plan":
        if (e.length !== 2 || !differentSpeakers || span > 86400) return null;
        return make("datedInvitation", "exchange", [ctx.claim("setup", first), ctx.claim("punchline", last)], answered, 3.0);
      case "warm":
        if (e.length !== 2 || !differentSpeakers || span > 86400) return null;
        return make("warmMoment", "exchange", [ctx.claim("setup", first), ctx.claim("punchline", last)], answered, 3.0);
    }
  }
}

export class WrappedCombinedProvider implements WrappedCandidateProviding {
  constructor(readonly providers: WrappedCandidateProviding[]) {}
  candidates(context: WrappedAnalysisContext): WrappedCandidate[] {
    return this.providers.flatMap((p) => p.candidates(context));
  }
}

/** Added to a model pick when a rule independently found at least two of the same messages. */
export const CORROBORATION_BONUS = 1.5;

/** Signals whose evidence is a whole day or every late reply, too broad to corroborate a single moment. */
const aggregateSignals = new Set<WrappedSignal>(["busiestDay", "replyGaps"]);

export function isCorroborated(pick: WrappedCandidate, rules: WrappedCandidate[]): boolean {
  const ids = new Set(pick.evidenceIDs);
  return rules.some((r) => !r.suggestedByModel && !aggregateSignals.has(r.signal) && r.evidenceIDs.filter((id) => ids.has(id)).length >= 2);
}

/** Rules plus whatever model suggestions are available; picks a rule corroborates get CORROBORATION_BONUS. */
export class WrappedModelAwareProvider implements WrappedCandidateProviding {
  constructor(
    readonly suggestions: WrappedModelSuggestion[],
    readonly options: WrappedModelOptions = defaultModelOptions(),
  ) {}

  candidates(context: WrappedAnalysisContext): WrappedCandidate[] {
    const rules = new WrappedHeuristicProvider().candidates(context);
    const picks = new WrappedSuggestionProvider(this.suggestions, this.options).candidates(context);
    return [...rules, ...picks.map((c) => (isCorroborated(c, rules) ? { ...c, score: c.score + CORROBORATION_BONUS } : c))];
  }
}

export const modelAwareProvider = (suggestions: WrappedModelSuggestion[], options: WrappedModelOptions = defaultModelOptions()) =>
  new WrappedModelAwareProvider(suggestions, options);

export type WrappedModelRace =
  | { status: "onTime"; suggestions: WrappedModelSuggestion[] }
  | { status: "failed"; error: unknown }
  | { status: "late"; late: Promise<WrappedModelSuggestion[] | null> };

/**
 * Gives the model `timeoutMs`. On time: its suggestions. Late: a promise of them, for "Another edition".
 * A failure (thrown or rejected) is reported, never thrown, so callers fall back to rules.
 */
export async function raceModel(source: WrappedModelSource, prompt: WrappedModelPrompt, timeoutMs: number): Promise<WrappedModelRace> {
  let failure: { error: unknown } | null = null;
  const request = Promise.resolve()
    .then(() => source.suggestions(prompt))
    .catch((error: unknown) => {
      failure = { error };
      return null;
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const first = await Promise.race([request.then((value) => ({ value })), timeout]);
  clearTimeout(timer);
  if (first === "timeout") return { status: "late", late: request };
  const failed = failure as { error: unknown } | null;
  if (failed) return { status: "failed", error: failed.error };
  return { status: "onTime", suggestions: first.value ?? [] };
}
