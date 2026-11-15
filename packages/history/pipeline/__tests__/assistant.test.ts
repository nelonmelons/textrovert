import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ask, verify, type Complete, type ConversationRef } from "../assistant/agent";
import { chunkMessages, MemoryIndex, type Embed } from "../assistant/memory";
import { MessageStore, type MessageRow, type StoredMessage } from "../store";

let dir: string;
let store: MessageStore;
let memory: MemoryIndex;
const T0 = Date.UTC(2026, 9, 1, 18);
const HOUR = 3_600_000;

const row = (conversation: string, ts: number, sender: string, text: string): MessageRow => ({
  uid: conversation + ts + sender,
  conversation,
  ts,
  sender,
  kind: "text",
  text,
  meta: null,
});

const conversations: ConversationRef[] = [
  { id: "id-ava", key: "k-ava", title: "Ava Park", platform: "instagram", kind: "dm", participants: ["Ava Park", "Alex"], selfName: "Alex", messageCount: 3, lastAt: T0 + 2 * HOUR },
  { id: "id-sam", key: "k-sam", title: "Sam Lee", platform: "whatsapp", kind: "dm", participants: ["Sam Lee", "Alex"], selfName: "Alex", messageCount: 2, lastAt: T0 },
];

// Deterministic fake embeddings: one dimension per topic word.
const TOPICS = ["gift", "yosemite", "food"];
const embed: Embed = async (texts) =>
  texts.map((t) => TOPICS.map((w) => (t.toLowerCase().includes(w) || (w === "gift" && /candle|present|want/.test(t.toLowerCase())) ? 1 : 0.01)));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "assistant-test-"));
  const client = createClient({ url: "file:" + join(dir, "messages.db") });
  store = new MessageStore(client);
  memory = new MemoryIndex(client);
  await store.migrate();
  await memory.migrate();
  await store.insert("me", [
    row("k-ava", T0, "Ava Park", "i really want that vanilla candle from the market"),
    row("k-ava", T0 + 60_000, "Alex", "noted 👀"),
    row("k-ava", T0 + 2 * HOUR, "Ava Park", "what are you eating"),
    row("k-sam", T0, "Sam Lee", "yosemite trip in june?"),
    row("k-sam", T0 + 60_000, "Alex", "down"),
  ]);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("chunkMessages", () => {
  it("splits at long silences and labels the user", () => {
    const msgs: StoredMessage[] = [0, 1, 5 * 60].map((min, i) => ({ id: i + 1, conversation: "c", ts: T0 + min * 60_000, sender: i === 1 ? "Alex" : "Ava", kind: "text", text: "m" + i, meta: null }));
    const chunks = chunkMessages("c", msgs, (s) => (s === "Alex" ? "Me" : s));
    expect(chunks.map((c) => [c.text, c.maxId])).toEqual([["Ava: m0\nMe: m1", 2], ["Ava: m2", 3]]);
  });
});

describe("MemoryIndex", () => {
  it("indexes incrementally and finds passages by meaning within an owner", async () => {
    for (const c of conversations) {
      const msgs = await store.storedAfter("me", c.key, (await memory.indexedUpTo("me")).get(c.key) ?? 0);
      await memory.add("me", chunkMessages(c.key, msgs, (s) => s), embed);
    }
    const upTo = await memory.indexedUpTo("me");
    expect(await store.storedAfter("me", "k-ava", upTo.get("k-ava")!)).toEqual([]);
    const [hit] = await memory.nearest("me", (await embed(["gift"]))[0], 1);
    expect(hit.conversation).toBe("k-ava");
    expect(hit.text).toContain("vanilla candle");
    expect(await memory.nearest("someone-else", (await embed(["gift"]))[0], 5)).toEqual([]);
    const scoped = await memory.nearest("me", (await embed(["gift"]))[0], 5, { conversations: ["k-sam"] });
    expect(scoped.every((h) => h.conversation === "k-sam")).toBe(true);
  });
});

describe("ask", () => {
  it("scopes to the person, searches, and returns verified citations only", async () => {
    const seenTools: string[] = [];
    const script = [
      { name: "find_conversations", args: { name: "ava" } },
      { name: "search_by_meaning", args: { query: "gift she wants", conversations: ["c1"] } },
      { name: "answer", args: null },
    ];
    let step = 0;
    const complete: Complete = async (messages) => {
      const next = script[step++];
      seenTools.push(next.name);
      if (next.name === "find_conversations") expect(String(messages[0].content)).toContain("c1: Ava Park");
      if (next.name === "search_by_meaning") expect(String(messages.at(-1)!.content)).toContain("c1: Ava Park");
      if (next.args) return { content: null, tool_calls: [{ id: "t" + step, type: "function", function: { name: next.name, arguments: JSON.stringify(next.args) } }] };
      const toolOutput = String(messages.at(-1)!.content);
      const id = Number(/#(\d+) .*vanilla candle/.exec(toolOutput)![1]);
      return {
        content: null,
        tool_calls: [
          {
            id: "done",
            type: "function",
            function: {
              name: "answer",
              arguments: JSON.stringify({
                answer: "Ava wants a vanilla candle [1]. She also loves sushi [2].",
                citations: [
                  { n: 1, message_id: id, quote: "Really want  that vanilla candle" },
                  { n: 2, message_id: 999, quote: "sushi" },
                ],
              }),
            },
          },
        ],
      };
    };
    const result = await ask({ question: "what does ava want as a gift?", conversations, owner: "me", store, memory, embed, complete, timeZone: "America/Los_Angeles", now: T0 + 3 * HOUR });
    expect(seenTools).toEqual(["find_conversations", "search_by_meaning", "answer"]);
    expect(result.answer).toBe("Ava wants a vanilla candle [1]. She also loves sushi.");
    expect(result.citations).toEqual([
      expect.objectContaining({ n: 1, conversationId: "id-ava", sender: "Ava Park", fromMe: false, quote: "really want that vanilla candle" }),
    ]);
  });
});

describe("verify", () => {
  it("drops citation lists and stray tool names the model writes into the answer text", () => {
    const out = verify("Sam suggested Yosemite [1]\n\nCitations:\n[1] message_id 7: \"x\"\n\nAnswer.", [], new Map(), new Map());
    expect(out.answer).toBe("Sam suggested Yosemite");
    expect(verify("Done.\n\nAnswer.", [], new Map(), new Map()).answer).toBe("Done.");
  });

  it("falls back to the original message when the quote was paraphrased", () => {
    const m: StoredMessage = { id: 7, conversation: "k-sam", ts: T0, sender: "Sam Lee", kind: "text", text: "yosemite trip in june?", meta: null };
    const out = verify("Sam suggested Yosemite [1]", [{ n: 1, message_id: 7, quote: "let's go to yosemite" }], new Map([[7, m]]), new Map(conversations.map((c) => [c.key, c])));
    expect(out.citations[0].quote).toBe("yosemite trip in june?");
  });
});
