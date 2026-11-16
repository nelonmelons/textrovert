import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analyzeStoredConversations } from "../analyze";
import { memoryArchive } from "../archive";
import { ingestArchive, UnrecognizedExportError } from "../ingest";
import { buildInsights, buildPeople, type ConversationSummary } from "../insights";
import { MessageStore } from "../store";
import { LocalTime } from "../time";

let dir: string;
let store: MessageStore;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ingest-test-"));
  store = new MessageStore(createClient({ url: "file:" + join(dir, "messages.db") }));
  await store.migrate();
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const whatsappDm = [
  "15/01/2024, 21:41 - Sam Lee: did you see the game?? 😂",
  "15/01/2024, 21:43 - Kevin Z: yes lol insane",
  "15/01/2024, 21:44 - Kevin Z: <Media omitted>",
  "16/01/2024, 08:10 - Sam Lee: breakfast?",
  "16/01/2024, 08:12 - Kevin Z: omw",
].join("\n");

const whatsappGroup = [
  '13/01/2024, 10:00 - Ana created group "Weekend Crew"',
  "13/01/2024, 10:01 - Ana: hike saturday?",
  "13/01/2024, 10:05 - Sam Lee: in",
  "13/01/2024, 10:06 - Kevin Z: in!",
].join("\n");

const instagramThread = JSON.stringify({
  participants: [{ name: "Sam Lee" }, { name: "Kevin Z" }],
  messages: [
    { sender_name: "Kevin Z", timestamp_ms: Date.UTC(2024, 0, 20, 18, 0), content: "haha that reel" },
    { sender_name: "Sam Lee", timestamp_ms: Date.UTC(2024, 0, 20, 17, 59), share: { link: "https://instagram.com/reel/x" } },
  ],
  title: "Sam Lee",
  is_still_participant: true,
  thread_path: "inbox/samlee_123",
});

const chatgpt = JSON.stringify([
  {
    id: "conv-1",
    title: "Pizza dough",
    create_time: 1705354865,
    current_node: "n3",
    mapping: {
      root: { parent: null, children: ["n1"], message: null },
      n1: { parent: "root", children: ["n2"], message: { author: { role: "user" }, create_time: 1705354865, content: { content_type: "text", parts: ["best pizza dough recipe?"] }, metadata: {}, recipient: "all" } },
      n2: { parent: "n1", children: ["n3"], message: { author: { role: "assistant" }, create_time: 1705354870, content: { content_type: "text", parts: ["Use 00 flour and a long cold ferment."] }, metadata: { model_slug: "gpt-4o" }, recipient: "all" } },
      n3: { parent: "n2", children: [], message: { author: { role: "user" }, create_time: 1705354900, content: { content_type: "text", parts: ["thanks!"] }, metadata: {}, recipient: "all" } },
    },
  },
]);

const files = {
  "exports/WhatsApp Chat with Sam Lee.txt": whatsappDm,
  "exports/WhatsApp Chat with Weekend Crew.txt": whatsappGroup,
  "exports/instagram/your_instagram_activity/messages/inbox/samlee_123/message_1.json": instagramThread,
  "exports/chatgpt/conversations.json": chatgpt,
  "exports/instagram/media/photo.jpg": new Uint8Array([1, 2, 3]),
  "exports/notes/todo.json": '{"todo": ["milk"]}',
};

describe("ingestArchive", () => {
  it("parses a mixed upload, works out who the user is, and stores every message once", async () => {
    const result = await ingestArchive({ owner: "kevin", archive: memoryArchive(files), store, timeZone: "UTC", selfNames: [] });

    expect(result.sources).toEqual([
      { platform: "whatsapp", files: 2, conversations: 2, messages: 9 },
      { platform: "instagram", files: 1, conversations: 1, messages: 2 },
      { platform: "chatgpt", files: 1, conversations: 1, messages: 3 },
    ]);
    expect(result.messagesStored).toBe(result.messagesParsed);
    expect(result.learnedSelfNames).toEqual(["Kevin Z"]);
    expect(result.warnings).toEqual(["Skipped 1 unrecognized file(s), e.g. exports/notes/todo.json"]);
    const byTitle = new Map(result.conversations.map((c) => [c.platform + "/" + c.title, c]));
    expect(byTitle.get("whatsapp/Sam Lee")).toMatchObject({ kind: "dm", selfName: "Kevin Z", parsed: 5 });
    expect(byTitle.get("whatsapp/Weekend Crew")).toMatchObject({ kind: "group", selfName: "Kevin Z" });
    expect(byTitle.get("instagram/Sam Lee")).toMatchObject({ kind: "dm", selfName: "Kevin Z", parsed: 2 });
    expect(byTitle.get("chatgpt/Pizza dough")).toMatchObject({ kind: "ai", selfName: "You" });

    const again = await ingestArchive({ owner: "kevin", archive: memoryArchive(files), store, timeZone: "UTC", selfNames: [] });
    expect(again.messagesParsed).toBe(result.messagesParsed);
    expect(again.messagesStored).toBe(0);
  });

  it("analyzes the stored history into conversations, people, and insights", async () => {
    const result = await ingestArchive({ owner: "kevin", archive: memoryArchive(files), store, timeZone: "UTC", selfNames: [] });
    const summaries = new Map<string, ConversationSummary>(
      result.conversations.map((c) => [c.key, { key: c.key, platform: c.platform, kind: c.kind, title: c.title, selfName: c.selfName, closeness: 0, stats: null }]),
    );
    const now = Date.UTC(2024, 1, 1);
    for await (const r of analyzeStoredConversations(store, "kevin", [...summaries.values()], new LocalTime("UTC"), now)) {
      Object.assign(summaries.get(r.key)!, { stats: r.stats, closeness: r.closeness });
    }
    const conversations = [...summaries.values()];
    const people = buildPeople(conversations);
    const insights = buildInsights(conversations, people, now);

    expect(people[0]).toMatchObject({ name: "Sam Lee", platforms: ["whatsapp", "instagram"], fromMe: 4, fromThem: 4 });
    expect(people.map((p) => p.name)).toEqual(["Sam Lee", "Ana"]);
    expect(insights.totals).toMatchObject({ messages: 10, sent: 5, received: 5, dms: 2, groups: 1, aiChats: 1, people: 2 });
    expect(insights.platforms.map((p) => p.platform)).toEqual(["whatsapp", "instagram"]);
    expect(insights.topPeople[0].name).toBe("Sam Lee");
    expect(insights.ai).toMatchObject({ prompts: 2, conversations: 1 });
    expect(insights.heatmap.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("fails the upload when the message store fails, rather than reporting a parser warning", async () => {
    const failing = Object.assign(Object.create(MessageStore.prototype), {
      insert: () => Promise.reject(new Error("store unavailable")),
    }) as MessageStore;
    await expect(
      ingestArchive({ owner: "kevin", archive: memoryArchive(files), store: failing, timeZone: "UTC", selfNames: [] }),
    ).rejects.toThrow("store unavailable");
  });

  it("explains what it supports when nothing in the upload is a chat export", async () => {
    await expect(
      ingestArchive({ owner: "kevin", archive: memoryArchive({ "a.jpg": "x", "b.json": "{}" }), store, timeZone: "UTC", selfNames: [] }),
    ).rejects.toBeInstanceOf(UnrecognizedExportError);
  });
});
