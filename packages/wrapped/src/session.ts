// The Wrapped screen's state, without any UI: open (reopen from cache), "Another edition", edition picker and widen.
// A host subscribes and renders `phase`.

import { generate, revalidate } from "./engine";
import type { WrappedConversation, WrappedDateRange, WrappedEdition, WrappedEmptyReason } from "./models";
import {
  defaultModelOptions, makeModelPrompt, modelAwareProvider, raceModel,
  type WrappedModelOptions, type WrappedModelSource, type WrappedModelSuggestion,
} from "./model";
import { WrappedEditionStore, seenSourceIDs } from "./store";

export type WrappedPhase =
  | { kind: "loading" }
  | { kind: "edition"; edition: WrappedEdition }
  | { kind: "exhausted"; seen: number; wider: WrappedDateRange | null }
  | { kind: "empty"; reason: WrappedEmptyReason; wider: WrappedDateRange | null };

export interface WrappedControllerOptions {
  conversation: WrappedConversation;
  ownerID: string;
  range: WrappedDateRange;
  store: WrappedEditionStore;
  locale?: string;
  modelSource?: WrappedModelSource | null;
  modelOptions?: WrappedModelOptions;
  /** Defaults to 2.5 s. */
  modelTimeoutMs?: number;
  now?: () => number;
}

export class WrappedController {
  phase: WrappedPhase = { kind: "loading" };
  editions: WrappedEdition[] = [];
  range: WrappedDateRange;
  modelSuggestions: WrappedModelSuggestion[] = [];

  readonly conversation: WrappedConversation;
  readonly ownerID: string;
  private readonly store: WrappedEditionStore;
  private readonly locale: string;
  private readonly modelSource: WrappedModelSource | null;
  private readonly modelOptions: WrappedModelOptions;
  private readonly modelTimeoutMs: number;
  private readonly now: () => number;
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(options: WrappedControllerOptions) {
    this.conversation = options.conversation;
    this.ownerID = options.ownerID;
    this.range = options.range;
    this.store = options.store;
    this.locale = options.locale ?? "en-US";
    this.modelSource = options.modelSource ?? null;
    this.modelOptions = options.modelOptions ?? defaultModelOptions();
    this.modelTimeoutMs = options.modelTimeoutMs ?? 2500;
    this.now = options.now ?? Date.now;
  }

  get usesModel(): boolean {
    return this.modelSource !== null;
  }

  /** Called on every change of phase, editions or range. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private get key(): string {
    return WrappedEditionStore.key(this.ownerID, this.conversation.id, this.range);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Shows the cached current edition (re-verified against the conversation), or generates the first one. */
  open(): Promise<void> {
    if (this.phase.kind !== "loading") return Promise.resolve();
    const session = this.store.session(this.key);
    const checked = session.editions.map((e) => revalidate(e, this.conversation)).filter((e) => e.highlights.length > 0);
    if (JSON.stringify(checked) !== JSON.stringify(session.editions)) {
      void this.store.update(this.key, (s) => {
        s.editions = checked;
        s.currentIndex = Math.min(s.currentIndex, Math.max(checked.length - 1, 0));
      });
    }
    this.editions = checked;
    const current = checked[this.store.session(this.key).currentIndex];
    if (current) {
      this.phase = { kind: "edition", edition: current };
      this.emit();
      return Promise.resolve();
    }
    return this.generate();
  }

  /**
   * Without a model source this settles synchronously and deterministically. With one, the model gets the timeout;
   * if it is late the rules-only edition shows, and its suggestions arrive in time for "Another edition".
   * The returned promise settles when the phase does.
   */
  generate(): Promise<void> {
    this.generation += 1;
    const token = this.generation;
    const seen = seenSourceIDs(this.store.session(this.key));
    const prompt = this.modelSource
      ? makeModelPrompt({ conversation: this.conversation, ownerID: this.ownerID, range: this.range, avoiding: seen, options: this.modelOptions })
      : null;
    if (!this.modelSource || !prompt) {
      this.finishGeneration();
      return Promise.resolve();
    }
    this.phase = { kind: "loading" };
    this.emit();
    return raceModel(this.modelSource, prompt, this.modelTimeoutMs).then((race) => {
      if (race.status === "onTime") this.modelSuggestions.push(...race.suggestions);
      if (race.status === "late") {
        void race.late.then((late) => {
          if (late) this.modelSuggestions.push(...late);
        });
      }
      if (token !== this.generation) return;
      this.finishGeneration();
    });
  }

  private finishGeneration() {
    const session = this.store.session(this.key);
    const outcome = generate({
      conversation: this.conversation, ownerID: this.ownerID, range: this.range, avoiding: seenSourceIDs(session),
      number: session.editions.length + 1, now: this.now(), locale: this.locale,
      provider: modelAwareProvider(this.modelSuggestions, this.modelOptions),
    });
    switch (outcome.kind) {
      case "edition":
        void this.store.update(this.key, (s) => {
          s.editions.push(outcome.edition);
          s.currentIndex = s.editions.length - 1;
        });
        this.editions = this.store.session(this.key).editions;
        this.phase = { kind: "edition", edition: outcome.edition };
        break;
      case "exhausted":
        this.phase = { kind: "exhausted", seen: outcome.seenCount, wider: outcome.widerRange };
        break;
      case "empty":
        this.phase = { kind: "empty", reason: outcome.reason, wider: outcome.widerRange };
        break;
    }
    this.emit();
  }

  select(index: number) {
    const edition = this.editions[index];
    if (!edition) return;
    void this.store.update(this.key, (s) => {
      s.currentIndex = index;
    });
    this.phase = { kind: "edition", edition };
    this.emit();
  }

  /** Moves to a wider range, carrying every source seen so far so the new range only surfaces new material. */
  widen(newRange: WrappedDateRange): Promise<void> {
    const carried = seenSourceIDs(this.store.session(this.key));
    this.range = newRange;
    this.modelSuggestions = [];
    void this.store.update(this.key, (s) => {
      if (s.editions.length === 0) s.carriedSeen = [...new Set([...s.carriedSeen, ...carried])];
    });
    this.editions = [];
    this.phase = { kind: "loading" };
    this.emit();
    return this.open();
  }
}
