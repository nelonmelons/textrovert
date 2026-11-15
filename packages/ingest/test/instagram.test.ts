import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { fixMojibake } from "../src/instagram.ts";
import { ingestZip, rankConversations } from "../src/index.ts";

const mojibake = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));
const ms = (iso: string) => new Date(iso).getTime();

function exportZip(): Uint8Array {
  const alex = {
    participants: [{ name: "Alex" }, { name: "Nelson" }],
    title: "Alex",
    thread_path: "inbox/alex_123",
    messages: [
      { sender_name: "Alex", timestamp_ms: ms("2026-11-10T21:05:00"), content: mojibake("haha ok see u then 😂") },
      { sender_name: "Nelson", timestamp_ms: ms("2026-11-10T21:00:00"), content: "friday?", reactions: [{ reaction: mojibake("❤"), actor: "Alex" }] },
    ],
  };
  const alexOlder = {
    participants: alex.participants,
    title: "Alex",
    thread_path: "inbox/alex_123",
    messages: [
      { sender_name: "Alex", timestamp_ms: ms("2026-11-09T10:00:00"), share: { link: "https://www.instagram.com/reel/abc", original_content_owner: "tytravls" } },
      { sender_name: "Alex", timestamp_ms: ms("2026-11-09T09:59:00"), photos: [{ uri: "x.jpg" }] },
    ],
  };
  const group = {
    participants: [{ name: "Emma" }, { name: "Nelson" }, { name: "lin" }],
    title: "LA trip",
    thread_path: "inbox/latrip_9",
    messages: [{ sender_name: "Emma", timestamp_ms: ms("2026-08-01T12:00:00"), content: "who's in" }],
  };
  return zipSync({
    "your_instagram_activity/messages/inbox/alex_123/message_1.json": strToU8(JSON.stringify(alex)),
    "your_instagram_activity/messages/inbox/alex_123/message_2.json": strToU8(JSON.stringify(alexOlder)),
    "your_instagram_activity/messages/inbox/latrip_9/message_1.json": strToU8(JSON.stringify(group)),
    "your_instagram_activity/messages/inbox/latrip_9/photos/1.jpg": new Uint8Array([1, 2, 3]),
  });
}

test("fixes Instagram's latin-1 mojibake", () => {
  assert.equal(fixMojibake(mojibake("hey 😂 ❤️ 你好")), "hey 😂 ❤️ 你好");
  assert.equal(fixMojibake("plain ascii"), "plain ascii");
  assert.equal(fixMojibake("already 😂"), "already 😂");
});

test("imports every thread from an export zip, merges message_N files, and detects self", () => {
  const convs = ingestZip(exportZip());
  assert.equal(convs.length, 2);
  const alex = convs.find((c) => c.title === "Alex")!;
  assert.equal(alex.source, "instagram");
  assert.equal(alex.isGroup, false);
  assert.deepEqual(alex.messages.map((m) => [m.isSelf, m.kind, m.text]), [
    [false, "media", "[photo]"],
    [false, "link", "[shared reel by @tytravls]"],
    [true, "text", "friday?"],
    [false, "text", "haha ok see u then 😂"],
  ]);
  assert.deepEqual(alex.messages[2].reactions, [{ emoji: "❤", by: "Alex" }]);
  assert.equal(convs.find((c) => c.title === "LA trip")!.isGroup, true);
});

test("a zip of imessage-exporter files becomes one conversation per chat", () => {
  const imsg = "May 17, 2022  5:29:42 PM\nJamie\nhey\n\nMay 17, 2022  5:31:10 PM\nMe\nyo\n\n";
  const convs = ingestZip(zipSync({ "imsg/+15551234567.txt": strToU8(imsg), "imsg/orphaned.txt": strToU8(""), "imsg/Sam.txt": strToU8(imsg.replace(/Jamie/g, "Sam")) }));
  assert.deepEqual(convs.map((c) => [c.source, c.title, c.messages.length]).sort(), [
    ["imessage", "Jamie", 2],
    ["imessage", "Sam", 2],
  ]);
});

test("ranks recent, two-sided 1:1 chats first", () => {
  const ranked = rankConversations(ingestZip(exportZip()), { now: new Date("2026-11-15T12:00:00") });
  assert.deepEqual(ranked.map((r) => [r.title, r.messageCount, r.fromMe, r.recentCount]), [
    ["Alex", 4, 1, 4],
    ["LA trip", 1, 0, 0],
  ]);
  assert.ok(ranked[0].score > ranked[1].score);
});
