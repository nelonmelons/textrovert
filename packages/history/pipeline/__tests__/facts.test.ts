import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ask, type Complete, type ConversationRef } from "../assistant/agent";
import { extractFacts, FactIndex, locateQuote, type Fact, type ResolveFact } from "../assistant/facts";
import type { Embed } from "../assistant/memory";
import { MessageStore, type StoredMessage } from "../store";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 10, 18);

describe("locateQuote", () => {
  it("finds exact, case-, whitespace- and curly-quote-insensitive spans in the original text", () => {
    const text = "omg I  REALLY want that\nvanilla candle, it’s so good";
    const exact = locateQuote(text, "vanilla candle")!;
    expect(text.slice(exact.start, exact.end)).toBe("vanilla candle");
    const loose = locateQuote(text, "really want that vanilla candle")!;
    expect(text.slice(loose.start, loose.end)).toBe("REALLY want that\nvanilla candle");
    const curly = locateQuote(text, "it's so good")!;
    expect(text.slice(curly.start, curly.end)).toBe("it’s so good");
    expect(locateQuote(text, "lavender candle")).toBeNull();
  });
});

describe("extractFacts", () => {
  const messages: StoredMessage[] = [
    { id: 5, conversation: "k", ts: T0, sender: "Ava", kind: "text", text: "starting at Stripe next month!!", meta: null },
    { id: 6, conversation: "k", ts: T0 + 60_000, sender: "Alex", kind: "text", text: "no way congrats", meta: null },
  ];
  it("keeps facts whose quote is really in the cited message, with its character span", async () => {
    const facts = await extractFacts("k", messages, (s) => (s === "Alex" ? "Me" : s), () => "", async (t) => {
      expect(t).toContain("#6 [] Me: no way congrats");
      return {
        facts: [
          { subject: "Ava", predicate: "works at", object: "Stripe (starting next month)", message_id: 5, quote: "Starting at stripe" },
          { subject: "Ava", predicate: "likes", object: "sushi", message_id: 5, quote: "loves sushi" },
          { subject: "Ava", predicate: "made-up", object: "x", message_id: 5, quote: "Stripe" },
          { subject: "Ava", predicate: "works at", object: "x", message_id: 99, quote: "Stripe" },
        ],
      };
    });
    expect(facts).toEqual([
      expect.objectContaining({ subject: "Ava", predicate: "works at", messageId: 5, quoteStart: 0, quoteEnd: 18, quote: "starting at Stripe", validFrom: T0, validTo: null }),
    ]);
  });
});

describe("FactIndex", () => {
  let dir: string;
  let store: MessageStore;
  let index: FactIndex;
  let ids: number[];
  const owner = "me";
  const embed: Embed = async (texts) => texts.map((t) => [/works at|job/i.test(t) ? 1 : 0.01, /likes|candle|matcha/i.test(t) ? 1 : 0.01, 0.01]);
  const conversations: ConversationRef[] = [
    { id: "id-ava", key: "k-ava", title: "Ava Park", platform: "instagram", kind: "dm", participants: ["Ava Park", "Alex"], selfName: "Alex", messageCount: 3, lastAt: T0 },
  ];
  const fact = (over: Partial<Fact>): Fact => ({
    conversation: "k-ava", subject: "Ava", predicate: "works at", object: "", messageId: 0, quoteStart: 0, quoteEnd: 0, quote: "", validFrom: T0, validTo: null, ...over,
  });

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "facts-test-"));
    const client = createClient({ url: "file:" + join(dir, "db") });
    store = new MessageStore(client);
    index = new FactIndex(client);
    await store.migrate();
    await index.migrate();
    await store.insert(owner, [
      { uid: "a", conversation: "k-ava", ts: T0, sender: "Ava Park", kind: "text", text: "first day at Figma!", meta: null },
      { uid: "b", conversation: "k-ava", ts: T0 + 90 * DAY, sender: "Ava Park", kind: "text", text: "ok I'm officially at Stripe now", meta: null },
      { uid: "c", conversation: "k-ava", ts: T0 + 91 * DAY, sender: "Ava Park", kind: "text", text: "obsessed with matcha lately", meta: null },
    ]);
    ids = (await store.page(owner, "k-ava", 10, null)).map((m) => m.id).sort((a, b) => a - b);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("closes a fact's window when a later one replaces it and skips repeats", async () => {
    const resolve: ResolveFact = async (fresh, existing) => {
      if (/Figma/.test(fresh)) return { duplicateOf: existing[0].id, invalidates: [] };
      return { duplicateOf: null, invalidates: existing.map((e) => e.id) };
    };
    const first = await index.add(owner, [fact({ object: "Figma", messageId: ids[0], quote: "Figma", quoteStart: 13, quoteEnd: 18 })], embed, resolve);
    expect(first).toEqual({ added: 1, duplicates: 0, invalidated: 0 });
    const later = await index.add(owner, [
      fact({ object: "Figma", messageId: ids[0], quote: "Figma", validFrom: T0 + DAY }),
      fact({ object: "Stripe", messageId: ids[1], quote: "Stripe", quoteStart: 25, quoteEnd: 31, validFrom: T0 + 90 * DAY }),
      fact({ predicate: "likes", object: "matcha", messageId: ids[2], quote: "matcha", validFrom: T0 + 91 * DAY }),
    ], embed, resolve);
    expect(later).toEqual({ added: 2, duplicates: 1, invalidated: 1 });

    const now = await index.about(owner, "ava");
    expect(now.map((f) => f.object)).toEqual(["matcha", "Stripe"]);
    const history = await index.about(owner, "Ava", { includeHistory: true });
    const figma = history.find((f) => f.object === "Figma")!;
    expect(figma.validTo).toBe(T0 + 90 * DAY);
    expect(figma.supersededBy).toBe(history.find((f) => f.object === "Stripe")!.id);
    expect(await index.about("someone-else", "ava")).toEqual([]);
  });

  it("lets the agent explain how a fact changed, citing the exact source quote", async () => {
    let output = "";
    const complete: Complete = async (messages) => {
      if (!output && messages.at(-1)!.role === "user") {
        return { content: null, tool_calls: [{ id: "a", type: "function", function: { name: "person_facts", arguments: JSON.stringify({ person: "ava", include_history: true }) } }] };
      }
      output = String(messages.at(-1)!.content);
      return { content: null, tool_calls: [{ id: "b", type: "function", function: { name: "answer", arguments: JSON.stringify({ answer: "Ava moved from Figma to Stripe [1].", citations: [{ n: 1, message_id: ids[1], quote: "officially at Stripe" }] }) } }] };
    };
    const result = await ask({ question: "where does ava work now?", conversations, owner, store, memory: null, facts: index, embed, complete, timeZone: "America/Los_Angeles", now: T0 + 100 * DAY });
    expect(output).toContain("Ava works at: Figma [2026-01-10 → 2026-04-10 (changed)]");
    expect(output).toContain('Ava works at: Stripe [since 2026-04-10] from #' + ids[1]);
    expect(result.citations).toEqual([expect.objectContaining({ n: 1, sender: "Ava Park", quote: "officially at Stripe" })]);
  });
});
