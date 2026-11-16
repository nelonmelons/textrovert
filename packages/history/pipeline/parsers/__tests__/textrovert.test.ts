import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analyzeStoredConversations } from "../../analyze";
import { memoryArchive } from "../../archive";
import { ingestArchive } from "../../ingest";
import { buildInsights, buildPeople, type ConversationSummary } from "../../insights";
import { MessageStore } from "../../store";
import { runParser } from "../../testing";
import { LocalTime } from "../../time";
import { chatgptParser } from "../chatgpt";
import { claudeParser } from "../claude";
import { imessageExporterParser } from "../imessageExporter";
import { instagramParser, messengerParser } from "../meta";
import { telegramParser } from "../telegram";
import { textrovertParser } from "../textrovert";

// Made-up people only. Seconds since 1970, as the Mac app writes them.
const t = (iso: string) => Date.parse(iso) / 1000;

const file = {
  format: "textrovert-messages",
  version: 1,
  exportedAt: t("2024-05-20T00:00:00Z"),
  chats: [
    {
      id: "chat:+15550001111",
      title: "+15550001111",
      group: false,
      people: ["Jamie Rivera"],
      messages: [
        { t: t("2024-05-17T17:29:42Z"), from: "Jamie Rivera", text: "hey are we still on for saturday? 🎉", reactions: [["Me", "❤️"]] },
        { t: t("2024-05-17T17:30:42Z"), text: "yes!\nbooked the table for 8" },
        { t: t("2024-05-17T17:32:42Z"), from: "Jamie Rivera", kind: "photo" },
        { t: t("2024-05-17T17:33:02Z"), text: "look at this", kind: "photo" },
        { t: t("2024-05-17T17:45:00Z"), kind: "deleted" },
        { t: t("2024-05-18T10:15:05Z"), from: "Jamie Rivera", text: "café ☕️ naïve 👩🏽‍💻 日本語" },
      ],
    },
    {
      id: "group:Weekend Crew",
      title: "Weekend Crew",
      group: true,
      people: ["+15550002222", "Jamie Rivera", "riley@example.com"],
      messages: [
        { t: t("2024-05-17T17:46:22Z"), text: "+15550002222 named the conversation Weekend Crew", kind: "system" },
        { t: t("2024-05-17T17:48:02Z"), from: "Jamie Rivera", text: "who's in for the hike?" },
        { t: t("2024-05-17T17:49:42Z"), from: "+15550002222", text: "me!" },
        { t: t("2024-05-17T17:51:22Z"), text: "count me in", reactions: [["riley@example.com", "😂"]] },
        { t: t("2024-05-17T17:52:00Z"), from: "riley@example.com", kind: "sticker" },
      ],
    },
    {
      id: "chat:+15550003333",
      title: "+15550003333",
      group: false,
      people: [],
      messages: [{ t: t("2024-05-19T09:00:00Z"), text: "note to self: call Taylor Brooks" }],
    },
  ],
};

const json = JSON.stringify(file);

describe(".textrovert messages file", () => {
  it("parses DMs, groups, media, deletions, system notices, reactions and emoji", async () => {
    const run = await runParser(textrovertParser, { "Textrovert Messages.textrovert": json });

    expect(run.claimed).toEqual(["Textrovert Messages.textrovert"]);
    expect(run.warnings).toEqual([]);
    expect(run.conversations.get("chat:+15550001111")).toMatchObject({
      title: "",
      kind: "dm",
      participants: ["Jamie Rivera", "Me"],
      selfName: "Me",
    });
    const dm = run.messages.get("chat:+15550001111")!;
    expect(dm.map((m) => m.kind)).toEqual(["text", "text", "media", "media", "deleted", "text"]);
    expect(dm[0]).toEqual({
      ts: Date.UTC(2024, 4, 17, 17, 29, 42),
      sender: "Jamie Rivera",
      kind: "text",
      text: "hey are we still on for saturday? 🎉",
      meta: { reactions: [{ sender: "Me", emoji: "❤️" }] },
    });
    expect(dm[1]).toEqual({ ts: Date.UTC(2024, 4, 17, 17, 30, 42), sender: "Me", kind: "text", text: "yes!\nbooked the table for 8" });
    expect(dm[2]).toEqual({ ts: Date.UTC(2024, 4, 17, 17, 32, 42), sender: "Jamie Rivera", kind: "media", text: null, meta: { media: ["photo"] } });
    expect(dm[3]).toMatchObject({ sender: "Me", kind: "media", text: "look at this", meta: { media: ["photo"] } });
    expect(dm[4]).toEqual({ ts: Date.UTC(2024, 4, 17, 17, 45), sender: "Me", kind: "deleted", text: null });
    expect(dm[5].text).toBe("café ☕️ naïve 👩🏽‍💻 日本語");

    expect(run.conversations.get("group:Weekend Crew")).toMatchObject({
      title: "Weekend Crew",
      kind: "group",
      participants: ["Jamie Rivera", "+15550002222", "Me", "riley@example.com"],
      selfName: "Me",
    });
    const group = run.messages.get("group:Weekend Crew")!;
    expect(group[0]).toEqual({ ts: Date.UTC(2024, 4, 17, 17, 46, 22), sender: "", kind: "system", text: "+15550002222 named the conversation Weekend Crew" });
    expect(group[3].meta).toEqual({ reactions: [{ sender: "riley@example.com", emoji: "😂" }] });
    expect(group[4]).toMatchObject({ sender: "riley@example.com", kind: "media", meta: { media: ["sticker"] } });

    // Nobody else spoke, so the chat keeps the file's title instead of being named after its senders.
    expect(run.conversations.get("chat:+15550003333")).toMatchObject({ title: "+15550003333", kind: "dm", participants: ["Me"] });
  });

  it("drops threaded-reply lines older Mac apps wrote as reactions, so the DM stays a DM", async () => {
    const old = {
      ...file,
      chats: [
        {
          id: "chat:+15550004444",
          title: "+15550004444",
          group: false,
          people: ["Priya Shah"],
          messages: [
            {
              t: t("2024-05-17T17:29:42Z"),
              from: "Priya Shah",
              text: "did you get the tickets",
              reactions: [["Me", "❤️"], ["you after 2 minutes, 3 seconds)", "May 17, 2024  5:35:00 PM (Read"], ["the store", "    stopped"]],
            },
            { t: t("2024-05-17T17:35:00Z"), text: "stopped by the store, got them!" },
          ],
        },
      ],
    };
    const run = await runParser(textrovertParser, { "old.textrovert": JSON.stringify(old) });
    expect(run.conversations.get("chat:+15550004444")).toMatchObject({ kind: "dm", participants: ["Priya Shah", "Me"] });
    expect(run.messages.get("chat:+15550004444")![0].meta).toEqual({ reactions: [{ sender: "Me", emoji: "❤️" }] });
  });

  it("produces the same conversation and messages as the imessage-exporter path for the same chat", async () => {
    const transcript = [
      "May 17, 2024  5:29:42 PM (Read by you after 5 minutes)",
      "Jamie Rivera",
      "hey are we still on for saturday?",
      "Tapbacks:",
      "    Loved by Me",
      "",
      "May 17, 2024  5:30:42 PM",
      "Me",
      "yes!",
      "",
      "May 17, 2024  5:32:42 PM",
      "Jamie Rivera",
      "/Users/sam/Library/Messages/Attachments/ab/11/AB12CD34-0000-4000-8000-000000000001/IMG_1234.HEIC",
      "",
    ].join("\n");
    const saved = {
      format: "textrovert-messages",
      version: 1,
      exportedAt: 0,
      chats: [
        {
          id: "chat:+15550001111",
          title: "+15550001111",
          group: false,
          people: ["Jamie Rivera"],
          messages: [
            { t: t("2024-05-17T17:29:42Z"), from: "Jamie Rivera", text: "hey are we still on for saturday?", reactions: [["Me", "❤️"]] },
            { t: t("2024-05-17T17:30:42Z"), text: "yes!" },
            { t: t("2024-05-17T17:32:42Z"), from: "Jamie Rivera", kind: "photo" },
          ],
        },
      ],
    };
    const viaExporter = await runParser(imessageExporterParser, { "+15550001111.txt": transcript }, { timeZone: "UTC" });
    const viaFile = await runParser(textrovertParser, { "Textrovert Messages.textrovert": JSON.stringify(saved) });
    expect([...viaFile.conversations]).toEqual([...viaExporter.conversations]);
    expect([...viaFile.messages]).toEqual([...viaExporter.messages]);
  });

  it("claims renamed or zipped copies by content, and leaves other platforms' JSON alone", async () => {
    // A copy whose encoder put "chats" first, with no "format" key in the first 4 KB.
    const reordered = JSON.stringify({ chats: file.chats, exportedAt: file.exportedAt, version: 1 });
    const run = await runParser(textrovertParser, {
      "Textrovert Messages.textrovert": json,
      "AirDrop/messages.json": json,
      "backup/messages": reordered,
      "telegram/result.json": JSON.stringify({ about: "Here is the data you requested", chats: { about: "x", list: [] } }),
      "instagram/messages/inbox/sam_1/message_1.json": JSON.stringify({ participants: [{ name: "Sam" }], messages: [{ sender_name: "Sam", timestamp_ms: 1, content: "hi" }] }),
      "chatgpt/conversations.json": JSON.stringify([{ id: "c1", title: "x", mapping: {} }]),
      "notes/todo.json": '{"todo": ["milk"]}',
      "photo.jpg": "not json",
    });
    expect(run.claimed).toEqual(["Textrovert Messages.textrovert", "AirDrop/messages.json", "backup/messages"]);

    const ours = { "Textrovert Messages.textrovert": json, "AirDrop/messages.json": json };
    for (const parser of [telegramParser, instagramParser, messengerParser, chatgptParser, claudeParser, imessageExporterParser]) {
      expect((await runParser(parser, ours)).claimed).toEqual([]);
    }
  });

  it("streams long chats in batches", async () => {
    const messages = Array.from({ length: 2500 }, (_, i) => ({ t: 1_700_000_000 + i, ...(i % 2 ? {} : { from: "Jamie Rivera" }), text: "message " + i }));
    const big = JSON.stringify({ format: "textrovert-messages", version: 1, exportedAt: 0, chats: [{ id: "chat:+15550001111", title: "+15550001111", group: false, people: ["Jamie Rivera"], messages }] });
    const run = await runParser(textrovertParser, { "big.textrovert": big }, { chunkSize: 4096 });
    const parsed = run.messages.get("chat:+15550001111")!;
    expect(parsed).toHaveLength(2500);
    expect(parsed[2499]).toEqual({ ts: (1_700_000_000 + 2499) * 1000, sender: "Me", kind: "text", text: "message 2499" });
  });

  it("warns instead of failing on unreadable or empty files", async () => {
    const run = await runParser(textrovertParser, {
      "broken.textrovert": '{"format":"textrovert-messages","version":1,"chats":[{"id":"chat:x","messages":[{"t":1,',
      "empty.textrovert": '{"format":"textrovert-messages","version":1,"exportedAt":0,"chats":[]}',
      "future.textrovert": JSON.stringify({ ...file, version: 2 }),
    });
    // A truncated file yields no complete chat, so it is reported rather than half-imported.
    expect(run.warnings.some((w) => w.startsWith("broken.textrovert: "))).toBe(true);
    expect([...run.conversations.keys()].some((k) => k === "chat:x")).toBe(false);
    expect(run.warnings).toContain("empty.textrovert: no chats found in this Textrovert messages file");
    expect(run.warnings.some((w) => w.startsWith("future.textrovert: Textrovert messages file version 2"))).toBe(true);
    expect(run.conversations.has("group:Weekend Crew")).toBe(true);
  });
});

describe(".textrovert through ingest", () => {
  let dir: string;
  let store: MessageStore;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "textrovert-test-"));
    store = new MessageStore(createClient({ url: "file:" + join(dir, "messages.db") }));
    await store.migrate();
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("routes the file to this parser, stores every message once, and the stats see the chats", async () => {
    const upload = () => memoryArchive({ "Textrovert Messages.textrovert": json }, "Textrovert Messages.textrovert");
    const result = await ingestArchive({ owner: "tester", archive: upload(), store, timeZone: "America/Los_Angeles", selfNames: [] });

    expect(result.sources).toEqual([{ platform: "imessage", files: 1, conversations: 3, messages: 12 }]);
    expect(result.messagesStored).toBe(result.messagesParsed);
    expect(result.warnings).toEqual([]);
    const again = await ingestArchive({ owner: "tester", archive: upload(), store, timeZone: "America/Los_Angeles", selfNames: [] });
    expect(again.messagesStored).toBe(0);

    const summaries = new Map<string, ConversationSummary>(
      result.conversations.map((c) => [c.key, { key: c.key, platform: c.platform, kind: c.kind, title: c.title, selfName: c.selfName, closeness: 0, stats: null }]),
    );
    const now = Date.UTC(2024, 4, 20);
    for await (const r of analyzeStoredConversations(store, "tester", [...summaries.values()], new LocalTime("America/Los_Angeles"), now)) {
      Object.assign(summaries.get(r.key)!, { stats: r.stats, closeness: r.closeness });
    }
    const conversations = [...summaries.values()];
    const people = buildPeople(conversations);
    const insights = buildInsights(conversations, people, now);
    expect(people[0]).toMatchObject({ name: "Jamie Rivera", platforms: ["imessage"] });
    expect(insights.totals).toMatchObject({ dms: 2, groups: 1 });
    expect(insights.platforms.map((p) => p.platform)).toEqual(["imessage"]);
  });
});
