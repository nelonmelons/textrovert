import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { csvParser } from "../csv";
import { decodeAttributedBody, imessageParser } from "../imessage";

const APPLE_EPOCH = 978_307_200_000;
const appleNs = (...utc: [number, number, number, number, number, number]) =>
  BigInt(Date.UTC(utc[0], utc[1] - 1, utc[2], utc[3], utc[4], utc[5]) - APPLE_EPOCH) * 1_000_000n;
const appleSeconds = (...utc: [number, number, number, number, number, number]) => (Date.UTC(utc[0], utc[1] - 1, utc[2], utc[3], utc[4], utc[5]) - APPLE_EPOCH) / 1000;

function typedstream(text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  const length = body.length < 0x80 ? Buffer.from([body.length]) : Buffer.from([0x81, body.length & 0xff, body.length >> 8]);
  return Buffer.concat([
    Buffer.from([0x04, 0x0b]),
    Buffer.from("streamtyped"),
    Buffer.from([0x81, 0xe8, 0x03, 0x84, 0x01, 0x40, 0x84, 0x84, 0x84, 0x12]),
    Buffer.from("NSAttributedString"),
    Buffer.from([0x00, 0x84, 0x84, 0x08]),
    Buffer.from("NSObject"),
    Buffer.from([0x00, 0x85, 0x92, 0x84, 0x84, 0x84, 0x08]),
    Buffer.from("NSString"),
    Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
    length,
    body,
    Buffer.from([0x86, 0x84, 0x02, 0x69, 0x49, 0x01, 0x05, 0x92, 0x84, 0x84, 0x84, 0x0c]),
    Buffer.from("NSDictionary"),
    Buffer.from([0x00, 0x94, 0x84, 0x01, 0x69, 0x01, 0x86, 0x86, 0x86]),
  ]);
}

function buildDatabase(): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "imessage-test-"));
  const path = join(dir, "chat.db");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, text TEXT, handle_id INTEGER DEFAULT 0,
      date INTEGER, is_from_me INTEGER DEFAULT 0, cache_has_attachments INTEGER DEFAULT 0, associated_message_guid TEXT,
      associated_message_type INTEGER DEFAULT 0, associated_message_emoji TEXT, item_type INTEGER DEFAULT 0, group_title TEXT,
      balloon_bundle_id TEXT, is_audio_message INTEGER DEFAULT 0, date_edited INTEGER DEFAULT 0, date_retracted INTEGER DEFAULT 0,
      attributedBody BLOB);
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, service TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, style INTEGER, chat_identifier TEXT, display_name TEXT);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER, message_date INTEGER DEFAULT 0, PRIMARY KEY (chat_id, message_id));
    CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
    CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, mime_type TEXT, transfer_name TEXT);
    CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
  `);
  for (const id of ["+15551234567", "sam@example.com", "+15559998888"]) db.prepare("INSERT INTO handle (id, service) VALUES (?, 'iMessage')").run(id);
  const chat = db.prepare("INSERT INTO chat (guid, style, chat_identifier, display_name) VALUES (?, ?, ?, ?)");
  chat.run("iMessage;-;+15551234567", 45, "+15551234567", "");
  chat.run("iMessage;+;chat123", 43, "chat123", "Trip");
  chat.run("SMS;-;+15551234567", 45, "+15551234567", "");
  chat.run("iMessage;-;nobody", 45, "nobody", "");
  chat.run("iMessage;+;chat999", 43, "chat999", "");
  const joinHandle = db.prepare("INSERT INTO chat_handle_join VALUES (?, ?)");
  [[1, 1], [2, 1], [2, 2], [2, 3], [3, 1], [5, 2]].forEach(([c, h]) => joinHandle.run(c, h));

  const message = db.prepare(
    "INSERT INTO message (guid, text, handle_id, date, is_from_me, cache_has_attachments, associated_message_guid, associated_message_type, associated_message_emoji, item_type, group_title, balloon_bundle_id, is_audio_message, date_edited, date_retracted, attributedBody) VALUES (@guid, @text, @handle, @date, @me, @att, @target, @type, @emoji, @item, @title, @balloon, @audio, @edited, @retracted, @body)",
  );
  const link = db.prepare("INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)");
  const add = (chatId: number, row: Record<string, unknown>) => {
    const defaults = { text: null, handle: 0, me: 0, att: 0, target: null, type: 0, emoji: null, item: 0, title: null, balloon: null, audio: 0, edited: 0, retracted: 0, body: null };
    const result = message.run({ ...defaults, ...row } as never);
    link.run(chatId, result.lastInsertRowid as number);
  };

  add(1, { guid: "G1", text: "hey there", handle: 1, date: appleNs(2024, 1, 15, 21, 41, 5) });
  add(1, { guid: "G2", text: null, me: 1, date: appleNs(2024, 1, 15, 21, 42, 0), body: typedstream("hello \u{1F602} " + "long ".repeat(40).trim()) });
  add(1, { guid: "G3", text: "\ufffc", handle: 1, att: 1, date: appleNs(2024, 1, 15, 21, 43, 0) });
  add(1, { guid: "T1", text: "Loved \u201chey there\u201d", me: 1, date: appleNs(2024, 1, 15, 21, 44, 0), target: "p:0/G1", type: 2000 });
  add(1, { guid: "T2", text: "Liked \u201chello\u201d", handle: 1, date: appleNs(2024, 1, 15, 21, 44, 5), target: "p:0/G2", type: 2001 });
  add(1, { guid: "T3", text: "Removed a like from \u201chello\u201d", handle: 1, date: appleNs(2024, 1, 15, 21, 44, 10), target: "p:0/G2", type: 3001 });
  add(1, { guid: "G4", text: null, me: 1, date: appleNs(2024, 1, 15, 22, 0, 0), retracted: 1 });
  add(1, { guid: "G5", text: "fixed typo", me: 1, date: appleNs(2024, 1, 15, 22, 1, 0), edited: 1 });
  add(1, { guid: "G6", text: null, handle: 1, date: appleNs(2024, 1, 15, 22, 2, 0), item: 6 });
  add(1, { guid: "G7", text: null, handle: 1, date: appleNs(2024, 1, 15, 22, 3, 0), audio: 1, att: 1 });
  add(1, { guid: "G8", text: null, handle: 1, date: appleNs(2024, 1, 15, 22, 4, 0) });

  add(2, { guid: "H1", text: null, handle: 1, date: appleNs(2024, 2, 1, 10, 0, 0), item: 1 });
  add(2, { guid: "H2", text: null, me: 1, date: appleNs(2024, 2, 1, 10, 0, 5), item: 2, title: "Trip" });
  add(2, { guid: "H3", text: "who's driving?", handle: 2, date: appleNs(2024, 2, 1, 10, 1, 0) });
  add(2, { guid: "H4", text: "me", handle: 3, date: appleNs(2024, 2, 1, 10, 2, 0) });
  add(2, { guid: "H5", text: "https://example.com/a", me: 1, date: appleNs(2024, 2, 1, 10, 3, 0), balloon: "com.apple.messages.URLBalloonProvider" });
  add(2, { guid: "H6", text: null, handle: 2, date: appleNs(2024, 2, 1, 10, 4, 0), balloon: "com.apple.DigitalTouchBalloonProvider" });
  add(2, { guid: "T4", text: "", handle: 3, date: appleNs(2024, 2, 1, 10, 5, 0), target: "p:0/H3", type: 2006, emoji: "\u{1F525}" });

  add(3, { guid: "S1", text: "old sms (seconds)", handle: 1, date: appleSeconds(2015, 6, 1, 12, 0, 0) });
  add(5, { guid: "U1", text: "solo group", handle: 2, date: appleNs(2024, 3, 1, 0, 0, 0) });

  const attach = db.prepare("INSERT INTO attachment (mime_type, transfer_name) VALUES (?, ?)");
  const attachJoin = db.prepare("INSERT INTO message_attachment_join VALUES (?, ?)");
  attach.run("image/jpeg", "IMG_0001.jpeg");
  attach.run("audio/x-caf", "Audio Message.caf");
  attach.run("image/png", "link.pluginPayloadAttachment");
  const rowOf = (guid: string) => (db.prepare("SELECT ROWID AS id FROM message WHERE guid = ?").get(guid) as { id: number }).id;
  attachJoin.run(rowOf("G3"), 1);
  attachJoin.run(rowOf("G7"), 2);
  attachJoin.run(rowOf("H5"), 3);
  db.close();
  const bytes = new Uint8Array(readFileSync(path));
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

describe("imessage", () => {
  const database = buildDatabase();

  it("claims chat.db by name or by SQLite header plus schema, and nothing else", async () => {
    const other = new DatabaseSync(":memory:");
    other.close();
    const run = await runParser(imessageParser, {
      "Library/Messages/chat.db": database,
      "backup/export.sqlite": database,
      "fake/chat.db": "not a database at all",
      "notes.txt": "SQLite format 3",
      "contacts.csv": "timestamp,sender,message\n1,a,b",
    });
    expect(run.claimed).toEqual(["Library/Messages/chat.db", "backup/export.sqlite"]);
    expect((await runParser(csvParser, { "chat.db": database })).claimed).toEqual([]);
  });

  it("builds conversations: DM vs group, titles, participants and self", async () => {
    const run = await runParser(imessageParser, { "chat.db": database });

    expect([...run.conversations.keys()]).toEqual(["+15551234567", "chat123", "chat999"]);
    expect(run.conversations.get("+15551234567")).toEqual({
      externalId: "+15551234567",
      title: "+15551234567",
      kind: "dm",
      participants: ["+15551234567", "You"],
      selfName: "You",
    });
    expect(run.conversations.get("chat123")).toMatchObject({
      title: "Trip",
      kind: "group",
      participants: ["+15551234567", "sam@example.com", "+15559998888", "You"],
    });
    expect(run.conversations.get("chat999")).toMatchObject({ title: "", kind: "group", participants: ["sam@example.com"] });
  });

  it("maps dates, text sources, media, reactions, edits and calls in a DM", async () => {
    const run = await runParser(imessageParser, { "chat.db": database });
    const messages = run.messages.get("+15551234567")!;

    const first = messages.find((m) => m.text === "hey there")!;
    expect(first).toMatchObject({ sender: "+15551234567", kind: "text", ts: Date.UTC(2024, 0, 15, 21, 41, 5) });
    expect(first.meta).toEqual({ reactions: [{ sender: "You", emoji: "\u2764\ufe0f" }] });

    const decoded = messages.find((m) => m.text?.startsWith("hello"))!;
    expect(decoded).toMatchObject({ sender: "You", kind: "text", text: "hello \u{1F602} " + "long ".repeat(40).trim() });
    expect(decoded.meta).toBeUndefined();

    expect(messages.find((m) => m.meta?.media?.includes("photo"))).toMatchObject({ kind: "media", text: null, sender: "+15551234567" });
    expect(messages.find((m) => m.kind === "deleted")).toMatchObject({ sender: "You", text: null });
    expect(messages.find((m) => m.text === "fixed typo")!.meta).toEqual({ edited: true });
    expect(messages.find((m) => m.kind === "call")).toMatchObject({ sender: "+15551234567", text: null });
    expect(messages.find((m) => m.meta?.media?.includes("audio"))).toMatchObject({ kind: "media" });
    expect(messages.some((m) => m.text?.includes("Loved") || m.text?.includes("Liked"))).toBe(false);
    expect(messages.filter((m) => m.meta?.reactions).length).toBe(1);
    expect(messages).toHaveLength(8);
  });

  it("merges the SMS thread of the same contact and reads second-based dates", async () => {
    const run = await runParser(imessageParser, { "chat.db": database });
    const sms = run.messages.get("+15551234567")!.find((m) => m.text === "old sms (seconds)")!;
    expect(sms.ts).toBe(Date.UTC(2015, 5, 1, 12, 0, 0));
  });

  it("handles group events, link balloons, app balloons and custom emoji tapbacks", async () => {
    const run = await runParser(imessageParser, { "chat.db": database });
    const messages = run.messages.get("chat123")!;
    expect(messages.map((m) => [m.sender, m.kind, m.text])).toEqual([
      ["", "system", null],
      ["", "system", null],
      ["sam@example.com", "text", "who's driving?"],
      ["+15559998888", "text", "me"],
      ["You", "text", "https://example.com/a"],
      ["sam@example.com", "media", null],
    ]);
    expect(messages[2].meta).toEqual({ reactions: [{ sender: "+15559998888", emoji: "\u{1F525}" }] });
    expect(messages[4].meta).toBeUndefined();
    expect(messages[5].meta).toEqual({ media: ["share"] });
  });

  it("warns instead of failing on a SQLite file that is not iMessage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "imessage-test-"));
    const path = join(dir, "chat.db");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE unrelated (x INTEGER)");
    db.close();
    const run = await runParser(imessageParser, { "chat.db": new Uint8Array(readFileSync(path)) });
    rmSync(dir, { recursive: true, force: true });
    expect(run.conversations.size).toBe(0);
    expect(run.warnings[0]).toContain("not an iMessage database");
  });
});

describe("decodeAttributedBody", () => {
  it("reads one-byte, two-byte and four-byte length prefixes", () => {
    expect(decodeAttributedBody(typedstream("hi"))).toBe("hi");
    const long = "x".repeat(300);
    expect(decodeAttributedBody(typedstream(long))).toBe(long);
    const body = Buffer.from("big", "utf8");
    const blob = Buffer.concat([Buffer.from("NSString"), Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b, 0x82, body.length, 0, 0, 0]), body]);
    expect(decodeAttributedBody(blob)).toBe("big");
  });

  it("returns null when there is no string record", () => {
    expect(decodeAttributedBody(Buffer.from("garbage"))).toBeNull();
  });
});
