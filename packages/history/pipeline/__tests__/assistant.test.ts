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
  { id: "id-emma", key: "k-emma", title: "Emma Di", platform: "instagram", kind: "dm", participants: ["Emma Di", "Nelson"], selfName: "Nelson", messageCount: 3, lastAt: T0 + 2 * HOUR },
  { id: "id-kev", key: "k-kev", title: "Kevin Zou", platform: "whatsapp", kind: "dm", participants: ["Kevin Zou", "Nelson"], selfName: "Nelson", messageCount: 2, lastAt: T0 },
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
    row("k-emma", T0, "Emma Di", "i really want that vanilla candle from the market"),
    row("k-emma", T0 + 60_000, "Nelson", "noted 👀"),
    row("k-emma", T0 + 2 * HOUR, "Emma Di", "what are you eating"),
    row("k-kev", T0, "Kevin Zou", "yosemite trip in june?"),
    row("k-kev", T0 + 60_000, "Nelson", "down"),
  ]);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("chunkMessages", () => {
  it("splits at long silences and labels the user", () => {
    const msgs: StoredMessage[] = [0, 1, 5 * 60].map((min, i) => ({ id: i + 1, conversation: "c", ts: T0 + min * 60_000, sender: i === 1 ? "Nelson" : "Emma", kind: "text", text: "m" + i, meta: null }));
    const chunks = chunkMessages("c", msgs, (s) => (s === "Nelson" ? "Me" : s));
    expect(chunks.map((c) => [c.text, c.maxId])).toEqual([["Emma: m0\nMe: m1", 2], ["Emma: m2", 3]]);
  });
});

describe("MemoryIndex", () => {
  it("indexes incrementally and finds passages by meaning within an owner", async () => {
    for (const c of conversations) {
      const msgs = await store.storedAfter("me", c.key, (await memory.indexedUpTo("me")).get(c.key) ?? 0);
      await memory.add("me", chunkMessages(c.key, msgs, (s) => s), embed);
    }
    const upTo = await memory.indexedUpTo("me");
    expect(await store.storedAfter("me", "k-emma", upTo.get("k-emma")!)).toEqual([]);
    const [hit] = await memory.nearest("me", (await embed(["gift"]))[0], 1);
    expect(hit.conversation).toBe("k-emma");
    expect(hit.text).toContain("vanilla candle");
    expect(await memory.nearest("someone-else", (await embed(["gift"]))[0], 5)).toEqual([]);
    const scoped = await memory.nearest("me", (await embed(["gift"]))[0], 5, { conversations: ["k-kev"] });
    expect(scoped.every((h) => h.conversation === "k-kev")).toBe(true);
  });
});

describe("ask", () => {
  it("scopes to the person, searches, and returns verified citations only", async () => {
    const seenTools: string[] = [];
    const script = [
      { name: "find_conversations", args: { name: "emma" } },
      { name: "search_by_meaning", args: { query: "gift she wants", conversations: ["c1"] } },
      { name: "answer", args: null },
    ];
    let step = 0;
    const complete: Complete = async (messages) => {
      const next = script[step++];
      seenTools.push(next.name);
      if (next.name === "find_conversations") expect(String(messages[0].content)).toContain("c1: Emma Di");
      if (next.name === "search_by_meaning") expect(String(messages.at(-1)!.content)).toContain("c1: Emma Di");
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
                answer: "Emma wants a vanilla candle [1]. She also loves sushi [2].",
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
    const result = await ask({ question: "what does emma want as a gift?", conversations, owner: "me", store, memory, embed, complete, timeZone: "America/Los_Angeles", now: T0 + 3 * HOUR });
    expect(seenTools).toEqual(["find_conversations", "search_by_meaning", "answer"]);
    expect(result.answer).toBe("Emma wants a vanilla candle [1]. She also loves sushi.");
    expect(result.citations).toEqual([
      expect.objectContaining({ n: 1, conversationId: "id-emma", sender: "Emma Di", fromMe: false, quote: "really want that vanilla candle" }),
    ]);
  });
});

describe("verify", () => {
  it("falls back to the original message when the quote was paraphrased", () => {
    const m: StoredMessage = { id: 7, conversation: "k-kev", ts: T0, sender: "Kevin Zou", kind: "text", text: "yosemite trip in june?", meta: null };
    const out = verify("Kevin suggested Yosemite [1]", [{ n: 1, message_id: 7, quote: "let's go to yosemite" }], new Map([[7, m]]), new Map(conversations.map((c) => [c.key, c])));
    expect(out.citations[0].quote).toBe("yosemite trip in june?");
  });
});
