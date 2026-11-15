import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWhatsApp } from "../src/whatsapp.ts";
import { reassignSelf } from "../src/conversation.ts";

test("iOS export with multi-line messages, media, and You as self", () => {
  const raw = [
    "[10/3/26, 12:44:58\u202fPM] You: hey",
    "",
    "second paragraph",
    "\u200e[10/3/26, 1:30:41\u202fPM] Ms. Lin: \u200eimage omitted",
    "[10/3/26, 1:31:00\u202fPM] Ms. Lin: This message was deleted.",
  ].join("\n");
  const conv = parseWhatsApp(raw);
  assert.deepEqual(conv.messages.map((m) => [m.ts, m.isSelf, m.kind, m.text]), [
    ["2026-10-03T12:44:58", true, "text", "hey\n\nsecond paragraph"],
    ["2026-10-03T13:30:41", false, "media", "[image omitted]"],
    ["2026-10-03T13:31:00", false, "unsent", "[deleted message]"],
  ]);
});

test("Android export detects day/month order and system lines", () => {
  const raw = [
    "25/12/2025, 21:04 - Messages and calls are end-to-end encrypted.",
    "25/12/2025, 21:04 - Alex created group \"Xmas\"",
    "25/12/2025, 21:05 - Alex: merry xmas",
    "26/12/2025, 09:00 - Sam: <Media omitted>",
  ].join("\n");
  const conv = parseWhatsApp(raw);
  assert.equal(conv.warnings.some((w) => w.includes("ambiguous")), false);
  assert.deepEqual(conv.messages.map((m) => [m.ts, m.senderId, m.kind]), [
    ["2025-12-25T21:04:00", "system", "system"],
    ["2025-12-25T21:05:00", "alex", "text"],
    ["2025-12-26T09:00:00", "sam", "media"],
  ]);
  assert.equal(conv.isGroup, true);
  const mine = reassignSelf(conv, "Sam");
  assert.equal(mine.messages[2].isSelf, true);
});

test("markdown export from Export Assistant", () => {
  const raw = [
    "# WhatsApp Chat Export: Ms. Lin",
    "## October 3, 2026",
    "[12:44 PM] **You:** hi",
    "",
    "more",
    "",
    "---",
    "",
    "## October 4, 2026",
    "[7:24 PM] **Ms. Lin:** yo",
  ].join("\n");
  const conv = parseWhatsApp(raw);
  assert.equal(conv.title, "Ms. Lin");
  assert.deepEqual(conv.messages.map((m) => [m.ts, m.isSelf, m.text]), [
    ["2026-10-03T12:44:00", true, "hi\n\nmore"],
    ["2026-10-04T19:24:00", false, "yo"],
  ]);
});
