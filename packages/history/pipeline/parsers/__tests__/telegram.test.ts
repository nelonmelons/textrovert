import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { chatgptParser } from "../chatgpt";
import { telegramParser } from "../telegram";

const dm = {
  name: "Sam Lee",
  type: "personal_chat",
  id: 555,
  messages: [
    { id: 1, type: "service", date: "2024-01-15T21:41:05", date_unixtime: "1705354865", actor: "Sam Lee", actor_id: "user555", action: "create_group", title: "x" },
    { id: 2, type: "message", date: "2024-01-15T21:42:00", date_unixtime: "1705354920", from: "Sam Lee", from_id: "user555", text: "hey" },
    {
      id: 3,
      type: "message",
      date: "2024-01-15T21:43:00",
      date_unixtime: "1705354980",
      from: "Kevin Zou",
      from_id: "user111",
      text: ["check ", { type: "link", text: "https://example.com" }, " ", { type: "bold", text: "now" }, "\u200e"],
      edited: "2024-01-15T21:44:00",
      edited_unixtime: "1705355040",
      reactions: [{ type: "emoji", count: 1, emoji: "\u{1F44D}", recent: [{ from: "Sam Lee", from_id: "user555", date: "2024-01-15T21:45:00" }] }],
    },
    { id: 4, type: "message", date: "2024-01-15T22:00:00", date_unixtime: "1705356000", from: "Sam Lee", from_id: "user555", photo: "photos/photo_1.jpg", text: "look" },
    { id: 5, type: "message", date: "2024-01-15T22:01:00", date_unixtime: "1705356060", from: "Kevin Zou", from_id: "user111", file: "stickers/s.webp", media_type: "sticker", sticker_emoji: "\u{1F600}", text: "" },
    { id: 6, type: "message", date: "2024-01-15T22:02:00", date_unixtime: "1705356120", from: "Sam Lee", from_id: "user555", file: "voice_messages/a.ogg", media_type: "voice_message", duration_seconds: 4, text: "" },
    { id: 7, type: "message", date: "2024-01-15T22:03:00", date_unixtime: "1705356180", from: "Sam Lee", from_id: "user555", file: "files/doc.pdf", text: "" },
    { id: 8, type: "service", date: "2024-01-15T22:10:00", date_unixtime: "1705356600", actor: "Sam Lee", actor_id: "user555", action: "phone_call", duration_seconds: 125, discard_reason: "hangup" },
    { id: 9, type: "message", date: "2024-01-16T08:00:00", from: "Kevin Zou", from_id: "user111", text: "no unixtime" },
  ],
};

const group = {
  name: "Weekend Crew",
  type: "private_supergroup",
  id: 777,
  messages: [
    { id: 1, type: "message", date: "2024-02-01T10:00:00", date_unixtime: "1706781600", from: "Alice", from_id: "user1", text: "hi" },
    { id: 2, type: "message", date: "2024-02-01T10:01:00", date_unixtime: "1706781660", from: "Kevin Zou", from_id: "user111", text: "yo" },
  ],
};

const fullExport = {
  about: "Here is the data you requested. Remember to keep it safe.",
  personal_information: { user_id: 111, first_name: "Kevin", last_name: "Zou", phone_number: "+1 555", username: "kz", bio: "has } brace" },
  contacts: { about: "x", list: [] },
  chats: {
    about: "This page lists all chats from this export.",
    list: [
      { name: "Saved Messages", type: "saved_messages", id: 111, messages: [{ id: 1, type: "message", date: "2024-01-01T00:00:00", date_unixtime: "1704067200", from: "Kevin Zou", from_id: "user111", text: "note" }] },
      dm,
      group,
      { name: "News", type: "public_channel", id: 900, messages: [{ id: 1, type: "message", date: "2024-01-01T00:00:00", date_unixtime: "1704067200", from: "News", from_id: "channel900", text: "headline" }] },
      { name: null, type: "personal_chat", id: 12, messages: [] },
    ],
  },
  left_chats: { about: "x", list: [{ name: "Old Group", type: "private_group", id: 31, messages: [{ id: 1, type: "message", date: "2020-01-01T00:00:00", date_unixtime: "1577836800", from: "Bob", from_id: "user9", text: "bye" }] }] },
};

describe("telegram", () => {
  it("parses a full export: chat kinds, self, skips and left chats", async () => {
    const run = await runParser(telegramParser, { "Telegram Desktop/ChatExport_2024-03-01/result.json": JSON.stringify(fullExport) });

    expect(run.claimed).toHaveLength(1);
    expect(run.selfHints).toEqual(["Kevin Zou", "Kevin", "Zou", "kz"]);
    expect([...run.conversations.keys()]).toEqual(["555", "777", "31"]);
    expect(run.conversations.get("555")).toMatchObject({ title: "Sam Lee", kind: "dm", participants: ["Sam Lee", "Kevin Zou"], selfName: "Kevin Zou" });
    expect(run.conversations.get("777")).toMatchObject({ kind: "group", participants: ["Alice", "Kevin Zou"], selfName: "Kevin Zou" });
    expect(run.conversations.get("31")).toMatchObject({ kind: "group", selfName: "Kevin Zou" });
    expect(run.warnings.some((w) => w.includes("channel") && w.includes("News"))).toBe(true);
    expect(run.warnings.some((w) => w.includes("no messages"))).toBe(true);
  });

  it("maps message kinds, text entities, media, calls, edits and reactions", async () => {
    const run = await runParser(telegramParser, { "result.json": JSON.stringify(fullExport) });
    const messages = run.messages.get("555")!;

    expect(messages.map((m) => m.kind)).toEqual(["system", "text", "text", "media", "media", "media", "media", "call", "text"]);
    expect(messages[0]).toEqual({ ts: 1705354865000, sender: "", kind: "system", text: null });
    expect(messages[2]).toMatchObject({
      sender: "Kevin Zou",
      text: "check https://example.com now",
      ts: 1705354980000,
      meta: { edited: true, reactions: [{ sender: "Sam Lee", emoji: "\u{1F44D}" }] },
    });
    expect(messages[3]).toMatchObject({ text: "look", meta: { media: ["photo"] } });
    expect(messages[4]).toMatchObject({ text: null, meta: { media: ["sticker"] } });
    expect(messages[5].meta).toEqual({ media: ["audio"] });
    expect(messages[6].meta).toEqual({ media: ["file"] });
    expect(messages[7]).toEqual({ ts: 1705356600000, sender: "Sam Lee", kind: "call", text: null, meta: { durationSec: 125 } });
    expect(messages[8].ts).toBe(Date.UTC(2024, 0, 16, 8, 0, 0));
  });

  it("converts local dates in the user's time zone when date_unixtime is absent", async () => {
    const run = await runParser(telegramParser, { "result.json": JSON.stringify(fullExport) }, { timeZone: "America/Los_Angeles" });
    expect(run.messages.get("555")![8].ts).toBe(Date.UTC(2024, 0, 16, 16, 0, 0));
  });

  it("parses a single-chat export and merges with a later full export of the same chat", async () => {
    const single = await runParser(telegramParser, { "ChatExport/result.json": JSON.stringify(dm) });
    expect(single.conversations.get("555")).toMatchObject({ title: "Sam Lee", kind: "dm", participants: ["Sam Lee", "Kevin Zou"] });
    expect(single.conversations.get("555")!.selfName).toBeNull();
    expect(single.messages.get("555")).toHaveLength(9);
    expect(single.selfHints).toEqual([]);

    const groupRun = await runParser(telegramParser, { "result.json": JSON.stringify(group) });
    expect(groupRun.conversations.get("777")).toMatchObject({ kind: "group", title: "Weekend Crew" });
  });

  it("streams a single-chat export too large to load at once", async () => {
    const filler = "x".repeat(900);
    const messages = Array.from({ length: 75_000 }, (_, i) => ({
      id: i,
      type: "message",
      date: "2024-01-01T00:00:00",
      date_unixtime: String(1_704_067_200 + i),
      from: i % 2 ? "Sam Lee" : "Kevin Zou",
      from_id: i % 2 ? "user555" : "user111",
      text: filler + i,
    }));
    const json = JSON.stringify({ name: "Big Chat", type: "personal_chat", id: 42, messages });
    expect(json.length).toBeGreaterThan(64 * 1024 * 1024);
    const run = await runParser(telegramParser, { "result.json": json }, { chunkSize: 1 << 20 });
    expect(run.conversations.get("42")).toMatchObject({ title: "Big Chat", kind: "dm", participants: ["Kevin Zou", "Sam Lee"] });
    expect(run.messages.get("42")).toHaveLength(75_000);
    expect(run.messages.get("42")![74_999].text).toBe(filler + 74_999);
  }, 120_000);

  it("claims only Telegram JSON", async () => {
    const run = await runParser(telegramParser, {
      "result.json": JSON.stringify(dm),
      "full/result.json": JSON.stringify(fullExport),
      "chatgpt/conversations.json": JSON.stringify([{ mapping: {}, current_node: null }]),
      "other.json": JSON.stringify({ participants: [{ name: "x" }], messages: [{ sender_name: "x" }] }),
      "notes.txt": '{"type": "personal_chat"}',
    });
    expect(run.claimed).toEqual(["result.json", "full/result.json"]);
    expect((await runParser(chatgptParser, { "result.json": JSON.stringify(dm) })).claimed).toEqual([]);
  });
});
