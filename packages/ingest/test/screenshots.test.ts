import { test } from "node:test";
import assert from "node:assert/strict";
import { framesToConversation, parseDivider, type FrameExtraction, type FrameItem } from "../src/screenshots.ts";

const msg = (side: "left" | "right", text: string, extra: Partial<FrameItem> = {}): FrameItem => ({
  type: "message", side, text, senderLabel: null, replyHeader: null, quoted: null, kind: "text", reactions: [], cutOff: false, ...extra,
});
const div = (text: string): FrameItem => ({ ...msg("left", text), type: "divider", side: "center" });
const frame = (n: number, items: FrameItem[]): FrameExtraction => ({ frame: n, timeSec: n / 4, platform: "instagram", chatTitle: "LA trip", items });

test("stitches upward-scrolling frames into one chronological transcript", () => {
  const frames = [
    frame(0, [msg("left", "hopefully no peanuts", { senderLabel: "Emma Di" }), msg("right", "ready"), div("NOV 7, 10:00 PM"), msg("left", "Fah bro", { senderLabel: "Gurmeher Singh" })]),
    frame(1, [msg("left", "wait so u guys deadass locked on china?", { cutOff: true }), div("NOV 7, 8:32 PM"), msg("left", "HOLY SHIT GUYS", { senderLabel: "Emma Di" }), msg("left", "hopefully no peanuts"), msg("right", "ready", { reactions: ["❤️"] })]),
    frame(2, [div("NOV 6, 1:59 PM"), msg("right", "Nelson and kevin are hopping on a call"), div("NOV 7, 8:32 PM"), msg("left", "HOLY SHlT GUYS", { senderLabel: "Emma Di" })]),
  ];
  const conv = framesToConversation(frames, { recordedAt: new Date(2026, 10, 15, 11, 50) });
  assert.deepEqual(conv.messages.map((m) => [m.ts, m.isSelf ? "me" : m.senderId, m.text]), [
    ["2026-11-06T13:59:00", "me", "Nelson and kevin are hopping on a call"],
    ["2026-11-07T20:32:00", "emma-di", "HOLY SHIT GUYS"],
    ["2026-11-07T20:32:00", "emma-di", "hopefully no peanuts"],
    ["2026-11-07T20:32:00", "me", "ready"],
    ["2026-11-07T22:00:00", "gurmeher-singh", "Fah bro"],
  ]);
  assert.deepEqual(conv.messages[3].reactions, [{ emoji: "❤️", by: null }]);
  assert.equal(conv.messages[2].tsConfidence, "inferred");
  assert.equal(conv.isGroup, true);
  assert.equal(conv.source, "instagram");
});

test("cleans sender labels the model put in the wrong field", () => {
  const conv = framesToConversation(
    [
      frame(0, [
        div("OCT 30, 11:05 A.M."),
        msg("left", "hi", { senderLabel: "lin" }),
        msg("left", "YAY", { senderLabel: "Emma Di · Edited" }),
        msg("left", "lin"),
        msg("left", "lin: should we get a hotel then"),
        msg("left", "can we share", { senderLabel: "Emma Di replied to lin" }),
      ]),
    ],
    { recordedAt: new Date(2026, 10, 15) },
  );
  assert.deepEqual(conv.messages.map((m) => [m.senderId, m.text]), [
    ["lin", "hi"],
    ["emma-di", "YAY"],
    ["lin", "should we get a hotel then"],
    ["emma-di", "can we share"],
  ]);
});

test("parses relative and absolute dividers against the recording date", () => {
  const ref = new Date(2026, 10, 15, 11, 50);
  assert.equal(parseDivider("FRI 9:04 P.M.", ref), "2026-11-13T21:04:00");
  assert.equal(parseDivider("Yesterday 9:41 AM", ref), "2026-11-14T09:41:00");
  assert.equal(parseDivider("Today 8:00 AM", ref), "2026-11-15T08:00:00");
  assert.equal(parseDivider("DEC 31, 11:59 P.M.", ref), "2025-12-31T23:59:00");
  assert.equal(parseDivider("Sat, Nov 8 at 9:04 PM", ref), "2026-11-08T21:04:00");
  assert.equal(parseDivider("Oct 30, 2024 at 12:22 PM", ref), "2024-10-30T12:22:00");
});
