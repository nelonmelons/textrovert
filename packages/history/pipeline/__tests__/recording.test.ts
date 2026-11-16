import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestArchive } from "../ingest";
import { framesToChat, parseDivider, type FrameExtraction, type FrameItem } from "../recording/frames";
import { recordingParser } from "../recording/parser";
import { frameWindows } from "../recording/vision";
import { MessageStore } from "../store";

const item = (side: FrameItem["side"], text: string, extra: Partial<FrameItem> = {}): FrameItem => ({
  type: "message",
  side,
  text,
  senderLabel: null,
  replyHeader: null,
  quoted: null,
  kind: "text",
  reactions: [],
  cutOff: false,
  ...extra,
});
const divider = (text: string) => item("center", text, { type: "divider" });
const frame = (n: number, items: FrameItem[]): FrameExtraction => ({ frame: n, timeSec: n, platform: "instagram", chatTitle: "Weekend Crew", items });

// Scrolling upward: the second window shows older messages above some already seen in the first.
const frames = [
  frame(1, [divider("Yesterday 9:41 PM"), item("left", "yosemite next month?", { senderLabel: "Sam" }), item("right", "im in"), item("left", "[photo]", { kind: "media", senderLabel: "Ana" })]),
  frame(0, [divider("FRI 7:05 PM"), item("left", "who's driving", { senderLabel: "Ana" }), divider("Yesterday 9:41 PM"), item("left", "yosemite next month?", { senderLabel: "Sam" }), item("right", "im in")]),
];
const recordedAt: [number, number, number, number, number] = [2026, 11, 15, 11, 51];

describe("parseDivider", () => {
  it("resolves relative dividers against the local recording time", () => {
    expect(parseDivider("Yesterday 9:41 AM", recordedAt)).toEqual([2026, 11, 14, 9, 41]);
    expect(parseDivider("FRI 7:05 P.M.", recordedAt)).toEqual([2026, 11, 13, 19, 5]);
    expect(parseDivider("OCT 30, 11:05 A.M.", recordedAt)).toEqual([2026, 10, 30, 11, 5]);
    expect(parseDivider("DEC 30, 11:05 A.M.", recordedAt)).toEqual([2025, 12, 30, 11, 5]);
    expect(parseDivider("no time here", recordedAt)).toBeNull();
  });
});

describe("framesToChat", () => {
  it("stitches overlapping frames into one ordered group chat without duplicates", () => {
    const chat = framesToChat(frames, { recordedAt });
    expect(chat).toMatchObject({ title: "Weekend Crew", platform: "instagram", isGroup: true });
    expect(chat.messages.map((m) => [m.sender, m.text, m.local])).toEqual([
      ["Ana", "who's driving", [2026, 11, 13, 19, 5]],
      ["Sam", "yosemite next month?", [2026, 11, 14, 21, 41]],
      ["Me", "im in", [2026, 11, 14, 21, 41]],
      ["Ana", "[photo]", [2026, 11, 14, 21, 41]],
    ]);
    expect(chat.messages[2].isSelf).toBe(true);
    expect(chat.messages[3]).toMatchObject({ kind: "media", meta: { media: ["photo"] } });
  });
});

describe("frameWindows", () => {
  it("covers every frame with overlapping windows", () => {
    const windows = frameWindows([...Array(23).keys()], 10, 2);
    expect(windows.map((w) => [w[0], w.at(-1)])).toEqual([[0, 9], [8, 17], [16, 22]]);
  });
});

describe("recording ingest", () => {
  let dir: string;
  let store: MessageStore;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "recording-test-"));
    store = new MessageStore(createClient({ url: "file:" + join(dir, "messages.db") }));
    await store.migrate();
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("stores a recording like any export, and re-recording the same chat adds nothing", async () => {
    const ingest = () => {
      const { parser, archive } = recordingParser(framesToChat(frames, { recordedAt }));
      return ingestArchive({ owner: "o1", archive, store, timeZone: "America/Los_Angeles", selfNames: [], parsers: [parser] });
    };
    const first = await ingest();
    expect(first.messagesStored).toBe(4);
    expect(first.conversations[0]).toMatchObject({ platform: "instagram", kind: "group", selfName: "Me", title: "Weekend Crew" });
    const rows = await store.page("o1", first.conversations[0].key, 10, null);
    expect(new Date(rows.at(-1)!.ts).toISOString()).toBe("2026-11-14T03:05:00.000Z");
    expect((await ingest()).messagesStored).toBe(0);
  });
});
