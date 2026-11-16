import { describe, expect, it } from "vitest";

import {
  MemoryStorage, WrappedAnalysisContext, WrappedController, WrappedEditionStore, WrappedEngine, WrappedFixtures, WrappedStubModelSource,
  WrappedSuggestionProvider, defaultModelOptions, editionSourceIDs, isModelSuggestion, makeModelPrompt, modelAwareProvider, modelOptionKeys,
  storedModelOptions,
  type WrappedConversation, type WrappedHighlight, type WrappedModelOptions, type WrappedModelSource, type WrappedModelSuggestion,
  type WrappedOutcome, type WrappedSignal,
} from "../src";

const F = WrappedFixtures;
const en = "en-US";
const range = F.defaultRange;
const now = 1_800_000_000_000;

const options = (o: Partial<WrappedModelOptions> = {}): WrappedModelOptions => ({ ...defaultModelOptions(), ...o });

function edition(conversation: WrappedConversation, suggestions: WrappedModelSuggestion[], opts = options(), seen: Iterable<string> = []): WrappedOutcome {
  return WrappedEngine.generate({ conversation, ownerID: "emma", range, avoiding: seen, now, locale: en, provider: modelAwareProvider(suggestions, opts) });
}

function candidates(suggestions: WrappedModelSuggestion[], opts = options(), conversation: WrappedConversation = F.theo) {
  const ctx = WrappedAnalysisContext.create(conversation, "emma", range, en)!;
  return new WrappedSuggestionProvider(suggestions, opts).candidates(ctx);
}

const s = (kind: string, messageIDs: string[], headline = "A moment", sensitive = false): WrappedModelSuggestion => ({
  kind, messageIDs, headline, why: "Because.", sensitive,
});

const expectEdition = (o: WrappedOutcome) => {
  if (o.kind !== "edition") throw new Error("expected an edition, got " + JSON.stringify(o));
  return o.edition;
};

async function waitUntil(condition: () => boolean, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
}

async function controller(source: WrappedModelSource | null, timeoutMs = 2500) {
  const store = await WrappedEditionStore.open(new MemoryStorage());
  return new WrappedController({ conversation: F.theo, ownerID: "emma", range, store, locale: en, modelSource: source, modelTimeoutMs: timeoutMs });
}

describe("Wrapped model layer", () => {
  it("rules alone miss Theo's moments and the stub finds them", () => {
    const rules = expectEdition(edition(F.theo, []));
    expect(rules.highlights.map((h) => h.signal)).toEqual(["datedInvitation"]);
    const mixed = expectEdition(edition(F.theo, F.theoStubSuggestions));
    expect(mixed.highlights.length).toBe(3);
    expect(mixed.highlights.filter(isModelSuggestion).length).toBe(2);
    expect(new Set(mixed.highlights.map((h) => h.signal))).toEqual(new Set<WrappedSignal>(["quotableLine", "runningJoke", "datedInvitation"]));
    expect(isModelSuggestion(mixed.highlights.find((h) => h.signal === "datedInvitation")!)).toBe(false);
    const saga = mixed.highlights.find((h) => h.signal === "runningJoke")!;
    expect(saga.headline).toBe("The bread maker saga");
    expect(saga.sourceMessageIDs).toEqual(["theo-01", "theo-19", "theo-11"]);
    expect(saga.quantity?.value).toBe("3");
    expect(saga.quantity?.detail).toBe("over 13 days");
    expect(saga.why).toBe("");
  });

  it("the model never supplies quote text", () => {
    const e = expectEdition(edition(F.theo, F.theoStubSuggestions));
    for (const h of e.highlights) for (const hq of h.quotes) {
      const source = F.theo.messages.find((m) => m.id === hq.quote.messageID)!;
      expect(source).toBeDefined();
      expect(hq.quote.text).toBe(source.text);
      expect(hq.quote.speakerID).toBe(source.senderID);
      expect(hq.quote.sentAt).toBe(source.sentAt);
    }
  });

  it("the gate rejects bad references", () => {
    expect(candidates([s("quotable", ["theo-99", "theo-05"])]), "fabricated id").toEqual([]);
    expect(candidates([s("quotable", ["theo-06", "theo-05"])]), "out of time order").toEqual([]);
    expect(candidates([s("quotable", ["theo-05", "theo-05"])]), "duplicate id").toEqual([]);
    expect(candidates([s("quotable", ["theo-04", "theo-06"])]), "who-said-it needs different speakers").toEqual([]);
    expect(candidates([s("twist", ["theo-01", "theo-02"])]), "twist needs three ids").toEqual([]);
    expect(candidates([s("callback", ["theo-04", "theo-06"])]), "callback needs two different days").toEqual([]);
    expect(candidates([s("roast", ["theo-05", "theo-06"])]), "unknown kind").toEqual([]);
    expect(candidates([s("quotable", ["theo-05", "theo-06"], "This headline is far too long to show")]), "headline over 6 words").toEqual([]);
    expect(candidates([s("quotable", ["theo-05", "theo-06"], "Holy shit")]), "blocked word").toEqual([]);
    expect(candidates([s("quotable", ["theo-05", "theo-06"], "Mad at the sink")]), "conflict framing").toEqual([]);
    expect(candidates([s("quotable", ["theo-05", "theo-06"])]).length).toBe(1);
  });

  it("range and type filters", () => {
    expect(candidates([s("quotable", ["noah-01", "noah-02"])], options(), F.noah), "outside the visible range").toEqual([]);
    expect(candidates([s("plan", ["mia-43", "mia-44"])], options(), F.mia), "system message").toEqual([]);
    expect(candidates([s("plan", ["mia-44", "mia-45"])], options(), F.mia), "undated message").toEqual([]);
  });

  it("sensitive flags and the classifier always win", () => {
    expect(candidates([s("swerve", ["theo-07", "theo-08"], "A moment", true)]), "model's own sensitive flag").toEqual([]);
    const conflict = s("twist", ["theo-15", "theo-16", "theo-17"]);
    expect(candidates([conflict])).toEqual([]);
    expect(candidates([conflict], options({ includeWarmMoments: true, allowAffectionateTeasing: true })), "conflict stays out even with both settings on").toEqual([]);
  });

  it("teasing is off by default and opt-in", () => {
    const tease = s("quotable", ["theo-13", "theo-14"]);
    expect(candidates([tease])).toEqual([]);
    expect(candidates([tease], options({ allowAffectionateTeasing: true })).length).toBe(1);
  });

  it("warm moments are off by default and opt-in", () => {
    const warm = s("warm", ["theo-17", "theo-18"]);
    expect(candidates([warm])).toEqual([]);
    const on = candidates([warm], options({ includeWarmMoments: true }));
    expect(on.map((c) => c.signal)).toEqual(["warmMoment"]);
    const e = expectEdition(edition(F.theo, [warm], options({ includeWarmMoments: true })));
    expect(e.highlights.some((h) => h.signal === "warmMoment")).toBe(true);
  });

  it("at most two model cards, and rules are kept when available", () => {
    const many = [
      s("callback", ["theo-01", "theo-11", "theo-19"]),
      s("quotable", ["theo-05", "theo-06"]),
      s("swerve", ["theo-10", "theo-11"]),
      s("plan", ["theo-02", "theo-03"]),
    ];
    const e = expectEdition(edition(F.theo, many));
    expect(e.highlights.filter(isModelSuggestion).length).toBeLessThanOrEqual(2);
    expect(e.highlights.some((h) => !isModelSuggestion(h))).toBe(true);
    const ids = e.highlights.flatMap((h) => h.sourceMessageIDs);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("select's cap and rule guarantee, directly", () => {
    const h = (id: string, signal: WrappedSignal, score: number, model: boolean, src: string[]): WrappedHighlight => ({
      id, presentation: "exchange", signal, headline: id, prompt: "", why: "", quotes: [], quantity: null, figure: { kind: "none" },
      sourceMessageIDs: src, score, shareByDefault: true, ...(model ? { suggestedByModel: true as const } : {}),
    });
    const picks = WrappedEngine.select([
      h("m1", "runningJoke", 9, true, ["a"]), h("m2", "quotableLine", 8, true, ["b"]),
      h("m3", "topicChange", 7, true, ["c"]), h("r1", "datedInvitation", 2.5, false, ["d"]),
    ]);
    expect(new Set(picks.map((p) => p.id))).toEqual(new Set(["m1", "m2", "r1"]));
    const twoModels = WrappedEngine.select([
      h("m1", "runningJoke", 9, true, ["a"]), h("m2", "runningJoke", 3.5, true, ["b"]), h("r1", "runningJoke", 2.5, false, ["c"]),
    ]);
    expect(twoModels.some((p) => p.id === "r1"), "a fresh rule-based card is kept even when it would not otherwise qualify").toBe(true);
    expect(WrappedEngine.select([h("m1", "runningJoke", 9, true, ["a"])]).map((p) => p.id), "model-only when no rule exists").toEqual(["m1"]);
  });

  it("unseen sources still apply to model suggestions", () => {
    const first = expectEdition(edition(F.theo, F.theoStubSuggestions));
    const second = edition(F.theo, F.theoStubSuggestions, options(), editionSourceIDs(first));
    if (second.kind === "edition") {
      const seen = editionSourceIDs(first);
      expect([...editionSourceIDs(second.edition)].every((id) => !seen.has(id))).toBe(true);
    }
  });

  it("the merge is deterministic for a fixed stub", () => {
    expect(edition(F.theo, F.theoStubSuggestions)).toEqual(edition(F.theo, F.theoStubSuggestions));
  });

  it("the prompt sends only eligible messages", () => {
    const p = makeModelPrompt({ conversation: F.theo, ownerID: "emma", range, avoiding: ["theo-05"], options: options() })!;
    expect(p.messageIDs.has("theo-05"), "already seen").toBe(false);
    expect(p.messageIDs.has("theo-13"), "teasing is off").toBe(false);
    expect(p.messageIDs.has("theo-15"), "conflict").toBe(false);
    expect(p.messageIDs.has("theo-14")).toBe(true);
    expect(p.instructions.includes("warm:"), "warm is off").toBe(false);
    const firstLine = p.chunks[0].split("\n")[0];
    expect(firstLine.startsWith("theo-01 | Theo | Nov 2"), firstLine).toBe(true);
    expect(firstLine.endsWith(" | I've decided to become a person who owns a bread maker."), firstLine).toBe(true);
    const teasing = makeModelPrompt({ conversation: F.theo, ownerID: "emma", range, options: options({ includeWarmMoments: true, allowAffectionateTeasing: true }) })!;
    expect(teasing.messageIDs.has("theo-13")).toBe(true);
    expect(teasing.messageIDs.has("theo-15"), "conflict is never sent").toBe(false);
    expect(teasing.instructions).toContain("warm:");
    const mia = makeModelPrompt({ conversation: F.mia, ownerID: "emma", range, options: options() })!;
    expect(mia.messageIDs.has("mia-43"), "system message").toBe(false);
    expect(mia.messageIDs.has("mia-45"), "undated").toBe(false);
    expect(mia.messageIDs.has("mia-02"), "outside range").toBe(false);
    expect(makeModelPrompt({ conversation: F.group, ownerID: "emma", range, options: options() })).toBeNull();
    const small = makeModelPrompt({ conversation: F.mia, ownerID: "emma", range, options: options(), chunkCharacters: 300, maxChunks: 2 })!;
    expect(small.chunks.length).toBe(2);
    expect(small.chunks.every((c) => c.length <= 300 + 160)).toBe(true);
  });

  it("options default to off and round-trip through storage", async () => {
    expect(defaultModelOptions()).toEqual({ includeWarmMoments: false, allowAffectionateTeasing: false });
    const storage = new MemoryStorage();
    expect(await storedModelOptions(storage)).toEqual(defaultModelOptions());
    await storage.setItem(modelOptionKeys.allowAffectionateTeasing, "true");
    expect(await storedModelOptions(storage)).toEqual({ includeWarmMoments: false, allowAffectionateTeasing: true });
  });

  it("cached editions without the model flag still decode", () => {
    const e = expectEdition(edition(F.mia, []));
    const json = JSON.stringify(e).replaceAll(',"suggestedByModel":true', "");
    expect(json).not.toContain("suggestedByModel");
    expect(JSON.parse(json)).toEqual(e);
  });

  // The screen controller (WrappedModel in Swift)

  it("with no model source, opening is synchronous and rules-only", async () => {
    const m = await controller(null);
    void m.open();
    expect(m.phase.kind, "expected an immediate edition").toBe("edition");
    if (m.phase.kind === "edition") expect(m.phase.edition.highlights.some(isModelSuggestion)).toBe(false);
  });

  it("on-time model suggestions shape the first edition", async () => {
    const m = await controller(new WrappedStubModelSource(F.theoStubSuggestions));
    void m.open();
    expect(m.phase.kind).toBe("loading");
    await waitUntil(() => m.phase.kind !== "loading");
    if (m.phase.kind !== "edition") throw new Error("expected an edition");
    expect(m.phase.edition.highlights.filter(isModelSuggestion).length).toBe(2);
  });

  it("a late model falls back to rules and feeds another edition", async () => {
    const m = await controller(new WrappedStubModelSource(F.theoStubSuggestions, 600), 100);
    void m.open();
    await waitUntil(() => m.phase.kind !== "loading");
    if (m.phase.kind !== "edition") throw new Error("expected an edition");
    expect(m.phase.edition.highlights.some(isModelSuggestion), "late model: rules-only edition").toBe(false);
    await waitUntil(() => m.modelSuggestions.length > 0);
    expect(m.modelSuggestions.length).toBeGreaterThan(0);
    void m.generate();
    await waitUntil(() => m.phase.kind === "edition" && m.phase.edition.number === 2, 2000);
    if (m.phase.kind !== "edition") throw new Error("expected an edition");
    expect(m.phase.edition.number).toBe(2);
    expect(m.phase.edition.highlights.some(isModelSuggestion)).toBe(true);
  });

  it("a failing model falls back to rules", async () => {
    const failing: WrappedModelSource = {
      suggestions: async () => {
        throw new Error("feature unsupported");
      },
    };
    const m = await controller(failing);
    void m.open();
    await waitUntil(() => m.phase.kind !== "loading");
    if (m.phase.kind !== "edition") throw new Error("expected an edition");
    expect(m.phase.edition.highlights.map((h) => h.signal)).toEqual(["datedInvitation"]);
  });
});
