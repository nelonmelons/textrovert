import { describe, expect, it } from "vitest";

import {
  MemoryStorage, WrappedAnalysisContext, WrappedEditionStore, WrappedEngine, WrappedFixtures, WrappedHeuristicProvider,
  buildShareText, editionSourceIDs, lateCount, longestGap, participant, quotesFor, rangeContains, rangeDayCount, rangeLabel, seenSourceIDs, sensitivity,
  type WrappedCandidate, type WrappedConversation, type WrappedDateRange, type WrappedEdition, type WrappedMessage,
} from "../src";

const F = WrappedFixtures;
const en = "en-US";
const range = F.defaultRange;
const now = 1_800_000_000_000;

function editions(conversation: WrappedConversation, r: WrappedDateRange = range, limit = 6): WrappedEdition[] {
  const seen = new Set<string>();
  const result: WrappedEdition[] = [];
  for (let n = 1; n <= limit; n++) {
    const outcome = WrappedEngine.generate({ conversation, ownerID: "emma", range: r, avoiding: seen, number: n, now, locale: en });
    if (outcome.kind !== "edition") break;
    result.push(outcome.edition);
    for (const id of editionSourceIDs(outcome.edition)) seen.add(id);
  }
  return result;
}

const allSources = (list: WrappedEdition[]) => list.reduce((s, e) => new Set([...s, ...editionSourceIDs(e)]), new Set<string>());
const disjoint = (a: Iterable<string>, b: Iterable<string>) => {
  const set = new Set(a);
  return [...b].every((x) => !set.has(x));
};

describe("WrappedEngine", () => {
  // Quote resolution and attribution

  it("every displayed quote resolves to its source message", () => {
    for (const conversation of [F.mia, F.sarah, F.jules]) {
      const all = editions(conversation);
      expect(all.length).toBeGreaterThan(0);
      for (const edition of all) {
        for (const h of edition.highlights) {
          for (const hq of h.quotes) {
            const source = conversation.messages.find((m) => m.id === hq.quote.messageID);
            expect(source, hq.quote.messageID).toBeDefined();
            expect(source?.senderID).toBe(hq.quote.speakerID);
            expect(participant(conversation, hq.quote.speakerID)?.name).toBe(hq.quote.speakerName);
            expect(source?.text.includes(hq.quote.text)).toBe(true);
            expect(source?.sentAt).toBe(hq.quote.sentAt);
            expect(rangeContains(edition.range, hq.quote.sentAt)).toBe(true);
          }
          for (const id of h.sourceMessageIDs) expect(conversation.messages.some((m) => m.id === id)).toBe(true);
        }
      }
    }
  });

  it("tampered claims are rejected", () => {
    const c = F.mia;
    const good = { role: "setup" as const, messageID: "mia-20", speakerID: "emma", text: "I have located my shoes." };
    expect(WrappedEngine.resolve(good, c, range)).not.toBeNull();
    expect(WrappedEngine.resolve({ ...good, speakerID: "mia" }, c, range), "wrong speaker").toBeNull();
    expect(WrappedEngine.resolve({ ...good, text: "I have located my keys." }, c, range), "altered text").toBeNull();
    expect(WrappedEngine.resolve({ ...good, messageID: "mia-999" }, c, range), "unknown id").toBeNull();
    expect(WrappedEngine.resolve({ role: "setup", messageID: "mia-43", speakerID: "mia", text: "Mia named the chat Taco Hill" }, c, range), "system message").toBeNull();
    expect(WrappedEngine.resolve({ role: "setup", messageID: "mia-45", speakerID: "emma", text: "Dentist update pending." }, c, range), "missing time").toBeNull();
    expect(WrappedEngine.resolve({ role: "setup", messageID: "mia-02", speakerID: "emma", text: "Taco." }, c, range), "outside range").toBeNull();
    const dup: WrappedConversation = { id: "d", service: "iMessage", participants: c.participants, messages: [c.messages[19], c.messages[19]] };
    expect(WrappedEngine.resolve(good, dup, range), "ambiguous duplicate ids").toBeNull();
  });

  it("a guess with the same speaker or fabricated evidence is not displayed", () => {
    const c = F.mia;
    const candidate = (reveal: string, speaker: string, evidence: string[]): WrappedCandidate => ({
      signal: "quotableLine", presentation: "guess", headline: "Who said it?", prompt: "", why: "",
      claims: [
        { role: "setup", messageID: "mia-20", speakerID: "emma", text: "I have located my shoes." },
        { role: "reveal", messageID: reveal, speakerID: speaker, text: c.messages.find((m) => m.id === reveal)!.text },
      ],
      evidenceIDs: evidence, quantity: null, figure: { kind: "none" }, score: 5, shareByDefault: true,
    });
    expect(WrappedEngine.highlight(candidate("mia-21", "mia", ["mia-20", "mia-21"]), c, range)).not.toBeNull();
    expect(WrappedEngine.highlight(candidate("mia-22", "emma", ["mia-20", "mia-22"]), c, range), "reveal by the same speaker").toBeNull();
    expect(WrappedEngine.highlight(candidate("mia-21", "mia", ["mia-20", "mia-21", "mia-404"]), c, range), "evidence id that does not exist").toBeNull();
  });

  // Date filtering

  it("range boundaries and filtering", () => {
    const narrow = F.range(11, 6, 11, 8);
    for (const e of editions(F.mia, narrow)) {
      for (const h of e.highlights) for (const hq of h.quotes) {
        expect(hq.quote.sentAt).toBeGreaterThanOrEqual(narrow.start);
        expect(hq.quote.sentAt).toBeLessThan(narrow.end);
      }
    }
    expect(rangeContains(range, range.start)).toBe(true);
    expect(rangeContains(range, range.end)).toBe(false);
    expect(rangeDayCount(range)).toBe(14);
    expect(rangeLabel(range, en)).toBe("Nov 1 – 14");
  });

  // Reply gap counts

  it("reply gaps follow the definition", () => {
    const s = WrappedEngine.replyGaps(F.mia, "emma", range)!;
    expect(s).not.toBeNull();
    expect(lateCount(s)).toBe(3);
    expect(s.completedTurns).toBe(14);
    expect(s.openTurns, "Hello?? at the end has no reply yet").toBe(1);
    expect(s.skippedForMissingTime, "the turn broken by an undated message").toBe(1);
    expect(new Set(s.lateGaps.map((g) => g.replyMessageID))).toEqual(new Set(["mia-12", "mia-17", "mia-19"]));
    expect(s.lateGaps.some((g) => g.seconds === 86400 && g.replyMessageID === "mia-19"), "exactly 24 hours counts").toBe(true);
    expect(s.lateGaps.some((g) => g.incomingMessageID === "mia-35"), "23 h 59 min is not a late gap").toBe(false);
    expect(s.lateGaps.some((g) => g.replyMessageID === "mia-08"), "turn began before the range").toBe(false);
    expect(longestGap(s)?.incomingMessageID, "measured from the last message of the turn").toBe("mia-16");
    expect(longestGap(s)!.seconds).toBe((F.date(11, 5, 9, 40) - F.date(11, 3, 20, 13)) / 1000);
  });

  it("reply gaps use elapsed time across daylight saving and wider ranges", () => {
    const wide = F.range(10, 24, 11, 14);
    const s = WrappedEngine.replyGaps(F.mia, "emma", wide)!;
    expect(lateCount(s)).toBe(4);
    const dst = s.lateGaps.find((g) => g.replyMessageID === "mia-08")!;
    expect(dst.seconds).toBe((F.date(11, 1, 9, 0) - F.date(10, 30, 22, 30)) / 1000);
    expect(dst.seconds, "clocks fell back an hour on Nov 1").toBe(127_800);
  });

  it("reply gaps exclude groups and foreign owners", () => {
    expect(WrappedEngine.replyGaps(F.group, "emma", range)).toBeNull();
    expect(WrappedEngine.replyGaps(F.mia, "nobody", range)).toBeNull();
  });

  it("a single late reply is not presented as a ghost era", () => {
    const s = WrappedEngine.replyGaps(F.sarah, "emma", range)!;
    expect(lateCount(s)).toBe(1);
    expect(editions(F.sarah).flatMap((e) => e.highlights).some((h) => h.signal === "replyGaps")).toBe(false);
  });

  it("the ghost highlight is private by default and the owner's replies only", () => {
    const ghost = editions(F.mia)[0].highlights.find((h) => h.signal === "replyGaps")!;
    expect(ghost).toBeDefined();
    expect(ghost.shareByDefault).toBe(false);
    expect(ghost.quantity?.value).toBe("3");
    expect(quotesFor(ghost, "reveal").map((q) => q.speakerID)).toEqual(["emma", "emma", "emma"]);
    expect(quotesFor(ghost, "context").map((q) => q.speakerID)).toEqual(["mia", "mia", "mia"]);
    expect(ghost.figure.kind).toBe("gaps");
    if (ghost.figure.kind === "gaps") expect(ghost.figure.seconds.length).toBe(3);
  });

  // Variety, regeneration and exhaustion

  it("two conversations produce different editions", () => {
    const a = editions(F.mia)[0], b = editions(F.sarah)[0];
    expect(a.highlights.map((h) => h.signal)).not.toEqual(b.highlights.map((h) => h.signal));
    expect(a.highlights.map((h) => h.signal)).toEqual(["quotableLine", "replyGaps", "runningJoke"]);
    expect(b.highlights.map((h) => h.signal)).toEqual(["runningJoke", "topicChange", "lastLineTwist"]);
    expect([...editionSourceIDs(a)].every((id) => id.startsWith("mia-"))).toBe(true);
    expect([...editionSourceIDs(b)].every((id) => id.startsWith("sarah-"))).toBe(true);
    expect(a.highlights.map((h) => h.headline)).not.toEqual(b.highlights.map((h) => h.headline));
  });

  it("another edition uses only unseen sources until exhausted", () => {
    for (const conversation of [F.mia, F.sarah]) {
      const all = editions(conversation);
      expect(all.length).toBeGreaterThanOrEqual(2);
      const seen = new Set<string>();
      for (const e of all) {
        expect(disjoint(seen, editionSourceIDs(e)), `edition ${e.number} repeated a source message`).toBe(true);
        for (const id of editionSourceIDs(e)) seen.add(id);
        expect(e.highlights.length).toBeLessThanOrEqual(3);
        const ids = e.highlights.flatMap((h) => h.sourceMessageIDs);
        expect(ids.length, "highlights inside one edition share a source").toBe(new Set(ids).size);
      }
      const next = WrappedEngine.generate({ conversation, ownerID: "emma", range, avoiding: seen, number: all.length + 1, locale: en });
      expect(next.kind, "expected exhaustion").toBe("exhausted");
      if (next.kind !== "exhausted") return;
      expect(next.seenCount).toBe(seen.size);
      expect(next.widerRange).not.toBeNull();
      expect(next.widerRange!.start).toBeLessThan(range.start);
    }
  });

  it("a wider range with carried seen sources surfaces only new material", () => {
    const c = F.mia;
    const seen = allSources(editions(c));
    const exhausted = WrappedEngine.generate({ conversation: c, ownerID: "emma", range, avoiding: seen, number: 4, locale: en });
    if (exhausted.kind !== "exhausted" || !exhausted.widerRange) throw new Error("expected exhaustion with a wider range");
    const wider = exhausted.widerRange;
    const result = WrappedEngine.generate({ conversation: c, ownerID: "emma", range: wider, avoiding: seen, number: 1, now, locale: en });
    if (result.kind !== "edition") throw new Error("the older October messages should add a moment: " + JSON.stringify(result));
    expect(disjoint(seen, editionSourceIDs(result.edition))).toBe(true);
    expect(result.edition.highlights.flatMap((h) => h.quotes).some((q) => q.quote.sentAt < range.start)).toBe(true);
    expect(WrappedEngine.widerRange(c, wider)).toBeNull();
  });

  it("generation is deterministic", () => {
    const a = WrappedEngine.generate({ conversation: F.sarah, ownerID: "emma", range, now, locale: en });
    const b = WrappedEngine.generate({ conversation: F.sarah, ownerID: "emma", range, now, locale: en });
    expect(a).toEqual(b);
  });

  // Evidence-backed quantities

  it("running joke counts and timeline come from the messages", () => {
    const joke = editions(F.mia)[0].highlights.find((h) => h.signal === "runningJoke")!;
    expect(joke.headline).toBe("“define” keeps coming back");
    expect(joke.quantity?.value).toBe("4");
    expect(new Set(joke.sourceMessageIDs)).toEqual(new Set(["mia-13", "mia-23", "mia-34", "mia-40"]));
    if (joke.figure.kind !== "occurrences") throw new Error("expected an occurrences figure");
    expect(joke.figure.dates).toEqual(["mia-13", "mia-23", "mia-34", "mia-40"].map((id) => F.mia.messages.find((m) => m.id === id)!.sentAt));
    expect(joke.quantity?.detail).toBe("over 11 days");
  });

  it("the busiest day is counted from timestamps", () => {
    const rows: WrappedMessage[] = [];
    for (let i = 0; i < 7; i++) rows.push({ id: `b-${i}`, senderID: i % 2 === 0 ? "emma" : "kai", text: `message ${i}`, sentAt: F.date(11, 3, 9 + i, 0) });
    rows.push({ id: "b-7", senderID: "kai", text: "later", sentAt: F.date(11, 5, 9, 0) });
    const c: WrappedConversation = { id: "kai", service: "iMessage", participants: [F.owner, { id: "kai", name: "Kai Moss" }], messages: rows };
    const ctx = WrappedAnalysisContext.create(c, "emma", range, en)!;
    const found = new WrappedHeuristicProvider().busiestDay(ctx)[0];
    expect(found.quantity?.value).toBe("7");
    if (found.figure.kind !== "dailyCounts") throw new Error("expected daily counts");
    expect(found.figure.peak).toBe(2);
    expect(found.figure.counts[2]).toBe(7);
    expect(found.figure.counts[4]).toBe(1);
    expect(found.figure.counts.reduce((a, b) => a + b, 0)).toBe(8);
  });

  // Sparse and empty

  it("a sparse conversation gives one honest card", () => {
    const all = editions(F.jules);
    expect(all.length).toBe(1);
    expect(all[0].highlights.length).toBe(1);
    expect(all[0].isShortRecap).toBe(true);
    expect(quotesFor(all[0].highlights[0], "punchline")[0]?.text).toBe("Yes, count me in.");
    const next = WrappedEngine.generate({ conversation: F.jules, ownerID: "emma", range, avoiding: editionSourceIDs(all[0]), number: 2, locale: en });
    expect(next).toEqual({ kind: "exhausted", seenCount: 2, widerRange: null });
  });

  it("empty states are honest", () => {
    expect(WrappedEngine.generate({ conversation: F.priya, ownerID: "emma", range, locale: en })).toEqual({
      kind: "empty", reason: { kind: "noHighlights", eligibleMessages: 3 }, widerRange: null,
    });
    const noah = WrappedEngine.generate({ conversation: F.noah, ownerID: "emma", range, locale: en });
    if (noah.kind !== "empty" || noah.reason.kind !== "noMessagesInRange" || !noah.widerRange) throw new Error("expected an empty range with a wider range");
    expect(noah.reason.outsideRange).toBe(2);
    expect(rangeContains(noah.widerRange, F.date(10, 2, 15, 0))).toBe(true);
    const unsupported = { kind: "empty", reason: { kind: "unsupportedConversation" }, widerRange: null };
    expect(WrappedEngine.generate({ conversation: F.group, ownerID: "emma", range, locale: en })).toEqual(unsupported);
    expect(WrappedEngine.generate({ conversation: F.mia, ownerID: "stranger", range, locale: en })).toEqual(unsupported);
  });

  // Sensitive content

  it("sensitive conflict and roasts are excluded by default", () => {
    const mia = editions(F.mia), sarah = editions(F.sarah);
    expect(mia[0].leftOutCount).toBe(3);
    expect(sarah[0].leftOutCount).toBe(2);
    expect(disjoint(allSources(mia), ["mia-28", "mia-32", "mia-37"])).toBe(true);
    expect(disjoint(allSources(sarah), ["sarah-14", "sarah-22"])).toBe(true);
  });

  it("the classifier distinguishes a roast of the other person from banter about yourself", () => {
    expect(sensitivity("mia you absolute clown", true, "Mia")).toBe("roastOfOther");
    expect(sensitivity("I am such a clown today", true, "Mia")).toBeNull();
    expect(sensitivity("I wish you'd told me sooner", false, "Mia")).toBe("conflict");
    expect(sensitivity("can you venmo me", false, "Mia")).toBe("privateTopic");
    expect(sensitivity("Define 'mostly.'", true, "Mia")).toBeNull();
  });

  // Cache and reopen

  it("editions survive reopen and revalidate against the source", async () => {
    const storage = new MemoryStorage();
    const all = editions(F.mia);
    const key = WrappedEditionStore.key("emma", "mia-chen", range);
    const store = await WrappedEditionStore.open(storage);
    await store.update(key, (s) => {
      s.editions = all;
      s.currentIndex = 1;
    });

    const reopened = (await WrappedEditionStore.open(storage)).session(key);
    expect(reopened.editions).toEqual(all);
    expect(reopened.currentIndex).toBe(1);
    expect(seenSourceIDs(reopened)).toEqual(allSources(all));
    expect((await WrappedEditionStore.open(storage)).session("other").editions).toEqual([]);

    const edited: WrappedConversation = {
      id: "mia-chen", service: "iMessage", participants: F.mia.participants,
      messages: F.mia.messages.map((m) => (m.id === "mia-20" ? { id: "mia-20", senderID: "emma", text: "I found my keys.", sentAt: m.sentAt } : m)),
    };
    const checked = WrappedEngine.revalidate(all[0], edited);
    expect(checked.highlights.some((h) => h.signal === "quotableLine"), "an edited source no longer verifies").toBe(false);
    expect(WrappedEngine.revalidate(all[0], F.mia)).toEqual(all[0]);
  });

  // Share preview

  it("the share preview contains only selected excerpts", () => {
    const e = editions(F.mia)[0];
    const friend = F.mia.participants[1];
    const defaults = new Set(e.highlights.filter((h) => h.shareByDefault).map((h) => h.id));
    expect(defaults.size).toBe(2);
    const text = buildShareText(e, defaults, F.owner, friend, en);
    expect(text.startsWith("Wrapped: Emma & Mia · Nov 1 – 14\n\nWho said it?\n“I have located my shoes.” — Emma, Nov 6")).toBe(true);
    expect(text).toContain("“lmao a legend. Take a victory lap.” — Mia Chen, Nov 6");
    expect(text).toContain("“Define 'on my way.' I'm at the door and you're clearly not.” — Mia Chen");
    expect(text).toContain("“Define 'mostly.'” — Emma");
    expect(text.includes("ghost"), "the reply-gap card stays private until selected").toBe(false);
    expect(text).not.toContain("Dinner tonight");
    const withGhost = buildShareText(e, new Set(e.highlights.map((h) => h.id)), F.owner, friend, en);
    expect(withGhost).toContain("3 late comebacks · Longest gap: 1 day 13 hours");
    expect(withGhost.includes("Dinner tonight"), "aggregate only: gap messages are not exported").toBe(false);
    expect(buildShareText(e, new Set(), F.owner, friend, en)).toBe("Wrapped: Emma & Mia · Nov 1 – 14");
  });
});
