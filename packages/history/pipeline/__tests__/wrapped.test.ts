import { describe, expect, it } from "vitest";

import { WrappedAnalysisContext, WrappedHeuristicProvider, WrappedStubModelSource, dateRangeFromDays, isModelSuggestion, quotesFor, type WrappedModelSource } from "@textrovert/wrapped";

import type { ConversationRef } from "../assistant/agent";
import type { StoredMessage } from "../store";
import { LocalTime } from "../time";
import { WRAPPED_OWNER_ID, runWrapped, toWrappedConversation } from "../wrapped";
import { ApiError } from "../assistant/api";
import { parseWrappedRequest, wrappedRequest } from "../assistant/wrappedApi";

const la = new LocalTime("America/Los_Angeles");
const at = (month: number, day: number, hour: number, minute: number) => la.fromLocal(2026, month, day, hour, minute, 0);
const range = dateRangeFromDays("2026-11-01", "2026-11-14", "America/Los_Angeles");

const dm: ConversationRef = {
  id: "conv-ava", key: "k-ava", title: "Ava Park", platform: "instagram", kind: "dm",
  participants: ["Ava Park", "Alex"], selfName: "Alex", messageCount: 0, lastAt: 0,
};
const group: ConversationRef = { ...dm, id: "conv-trip", key: "k-trip", title: "Trip", kind: "group", participants: ["Ava Park", "Sam Lee", "Alex"] };

let nextId = 100;
const row = (ts: number, sender: string, text: string | null, kind: StoredMessage["kind"] = "text"): StoredMessage => ({
  id: nextId++, conversation: "k-ava", ts, sender, kind, text, meta: null,
});

const rows: StoredMessage[] = [
  row(at(11, 2, 18, 0), "Ava Park", "I adopted a cactus. His name is Cornelius."),
  row(at(11, 2, 18, 4), "Alex", "Cornelius is a strong name lol"),
  row(at(11, 3, 9, 0), "Alex", null, "media"),
  row(at(11, 3, 9, 5), "", "Ava Park named the chat Desert", "system"),
  row(at(11, 4, 20, 0), "Ava Park", "Cornelius fell over. He is fine."),
  row(at(11, 4, 20, 2), "Alex", "Send Cornelius my regards."),
  row(at(11, 6, 12, 0), "Ava Park", "Cornelius has a hat now."),
  row(at(11, 6, 12, 1), "Alex", "Of course he does."),
  row(at(11, 8, 10, 0), "Alex", "Want to get tacos tomorrow at 7?"),
  row(at(11, 8, 10, 3), "Ava Park", "Yes obviously"),
  row(at(11, 10, 9, 0), "Ava Park", "My landlord painted over the window."),
  row(at(11, 10, 9, 2), "Alex", "Bold choice for a window."),
];

describe("toWrappedConversation", () => {
  it("maps store rows to Wrapped messages with stable ids and the owner's id", () => {
    const c = toWrappedConversation(dm, rows);
    expect(c.id).toBe("conv-ava");
    expect(c.service).toBe("Instagram");
    expect(c.participants).toEqual([{ id: "Ava Park", name: "Ava Park" }, { id: WRAPPED_OWNER_ID, name: "Alex" }]);
    expect(c.messages.map((m) => m.id)).toEqual(rows.map((r) => String(r.id)));
    expect(c.messages[0]).toEqual({ id: String(rows[0].id), senderID: "Ava Park", text: rows[0].text, sentAt: rows[0].ts, kind: "text" });
    expect(c.messages[1].senderID).toBe(WRAPPED_OWNER_ID);
    expect(c.messages[2], "media without text is never quotable").toMatchObject({ kind: "system", text: "", senderID: WRAPPED_OWNER_ID });
    expect(c.messages[3], "system rows have no sender").toMatchObject({ kind: "system", senderID: null });
  });

  it("treats Instagram activity lines stored as text as system messages", () => {
    const lines = [
      row(at(11, 9, 9, 0), "Ava Park", "ava.p sent an attachment."),
      row(at(11, 9, 9, 1), "Alex", "You started an audio call"),
      row(at(11, 9, 9, 2), "Ava Park", "Ava liked a message"),
      row(at(11, 9, 9, 3), "Alex", "I sent an attachment to the wrong chat"),
    ];
    expect(toWrappedConversation(dm, lines).messages.map((m) => m.kind)).toEqual(["system", "system", "system", "text"]);
    expect(toWrappedConversation({ ...dm, platform: "whatsapp" }, lines).messages.every((m) => m.kind === "text")).toBe(true);
  });

  it("leaves the owner out when the export never named them, so Wrapped reports it unsupported", () => {
    const c = toWrappedConversation({ ...dm, selfName: null }, rows);
    expect(c.participants.some((p) => p.id === WRAPPED_OWNER_ID)).toBe(false);
    expect(c.messages.some((m) => m.senderID === WRAPPED_OWNER_ID)).toBe(false);
  });
});

describe("runWrapped", () => {
  it("builds a rules-only edition whose quotes resolve to store rows", async () => {
    const run = await runWrapped({ ref: dm, rows, range, now: 0 });
    expect(run.model.status).toBe("off");
    if (run.outcome.kind !== "edition") throw new Error("expected an edition: " + JSON.stringify(run.outcome));
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    for (const h of run.outcome.edition.highlights) {
      for (const q of h.quotes) {
        const source = byId.get(q.quote.messageID)!;
        expect(source.text).toBe(q.quote.text);
        expect(q.quote.sentAt).toBe(source.ts);
        expect(q.quote.speakerName).toBe(source.sender);
      }
    }
    // The joke is found from the rows; under RUNNING_JOKE_SCORE_CAP higher cards sharing its messages can take edition 1.
    const ctx = WrappedAnalysisContext.create(toWrappedConversation(dm, rows), WRAPPED_OWNER_ID, range)!;
    expect(new WrappedHeuristicProvider().runningJokes(ctx)[0]?.headline).toBe("“cornelius” keeps coming back");
    expect(run.outcome.edition.ownerID).toBe(WRAPPED_OWNER_ID);
  });

  it("returns the honest unsupported result for groups without reading or sending messages", async () => {
    let asked = false;
    const spy: WrappedModelSource = { suggestions: async () => ((asked = true), []) };
    const run = await runWrapped({ ref: group, rows, range, modelSource: spy });
    expect(run.outcome).toEqual({ kind: "empty", reason: { kind: "unsupportedConversation" }, widerRange: null });
    expect(run.conversation.messages).toEqual([]);
    expect(asked).toBe(false);
    expect(run.model.status).toBe("skipped");
  });

  it("feeds model picks through the same gate, by store id", async () => {
    const id = (i: number) => String(rows[i].id);
    const source = new WrappedStubModelSource([
      { kind: "quotable", messageIDs: [id(10), id(11)], headline: "The window", why: "Deadpan.", sensitive: false },
      { kind: "quotable", messageIDs: ["999999", id(11)], headline: "Made up", why: "Unknown id.", sensitive: false },
    ]);
    const run = await runWrapped({ ref: dm, rows, range, modelSource: source, now: 0, debug: true });
    expect(run.model).toMatchObject({ used: true, status: "onTime", suggestions: 2, accepted: 1 });
    expect(run.model.raw?.length).toBe(2);
    if (run.outcome.kind !== "edition") throw new Error("expected an edition");
    const pick = run.outcome.edition.highlights.find(isModelSuggestion)!;
    expect(quotesFor(pick, "setup")[0].text).toBe("My landlord painted over the window.");
  });

  it("falls back to rules when the model is late or fails", async () => {
    const late = await runWrapped({ ref: dm, rows, range, modelSource: new WrappedStubModelSource([], 200), timeoutMs: 20, now: 0 });
    expect(late.model.status).toBe("late");
    const failing: WrappedModelSource = { suggestions: async () => Promise.reject(new Error("boom")) };
    const failed = await runWrapped({ ref: dm, rows, range, modelSource: failing, now: 0 });
    expect(failed.model).toMatchObject({ status: "failed", error: "boom" });
    const rulesOnly = await runWrapped({ ref: dm, rows, range, now: 0 });
    expect(failed.outcome).toEqual(rulesOnly.outcome);
    expect(late.outcome).toEqual(rulesOnly.outcome);
  });
});

describe("POST /wrapped (shared handler)", () => {
  const options = { conversations: [dm, group], loadRows: async () => rows, timeZone: "America/Los_Angeles", modelSource: null };

  it("validates the body", () => {
    expect(() => parseWrappedRequest([])).toThrow(ApiError);
    expect(() => parseWrappedRequest({})).toThrow("conversationId is required");
    expect(() => parseWrappedRequest({ conversationId: "x", from: "2026-11-01" })).toThrow("from and through must both be YYYY-MM-DD dates");
    expect(parseWrappedRequest({ conversationId: "x", avoiding: ["1", 2], number: 2.7, model: false })).toMatchObject({
      conversationId: "x", avoiding: ["1"], number: 2, model: false,
    });
    expect(parseWrappedRequest({ conversationId: "x" })).not.toHaveProperty("from");
  });

  it("answers an edition with the conversation shell, range and wider range", async () => {
    const res = await wrappedRequest(parseWrappedRequest({ conversationId: "conv-ava", from: "2026-11-03", through: "2026-11-08", model: false }), options);
    expect(res.conversation).toEqual({
      id: "conv-ava", service: "Instagram", title: "Ava Park", kind: "dm", ownerID: WRAPPED_OWNER_ID,
      participants: [{ id: "Ava Park", name: "Ava Park" }, { id: WRAPPED_OWNER_ID, name: "Alex" }],
    });
    expect(res.conversation).not.toHaveProperty("messages");
    expect(res.range).toEqual(dateRangeFromDays("2026-11-03", "2026-11-08", "America/Los_Angeles"));
    expect(res.wider).toEqual(dateRangeFromDays("2026-11-02", "2026-11-10", "America/Los_Angeles"));
    expect(res.model.status).toBe("off");
  });

  it("defaults to the 30 days ending on the last message", async () => {
    const res = await wrappedRequest(parseWrappedRequest({ conversationId: "conv-ava", model: false }), options);
    expect(res.range).toEqual(dateRangeFromDays("2026-10-12", "2026-11-10", "America/Los_Angeles"));
    expect(res.outcome.kind).toBe("edition");
    expect(res.wider).toBeNull();
  });

  it("404s unknown chats and leaves groups unsupported without loading rows", async () => {
    await expect(wrappedRequest(parseWrappedRequest({ conversationId: "nope" }), options)).rejects.toMatchObject({ status: 404 });
    let loaded = false;
    const res = await wrappedRequest(parseWrappedRequest({ conversationId: "conv-trip" }), { ...options, loadRows: async () => ((loaded = true), rows) });
    expect(loaded).toBe(false);
    expect(res.outcome).toEqual({ kind: "empty", reason: { kind: "unsupportedConversation" }, widerRange: null });
  });
});
