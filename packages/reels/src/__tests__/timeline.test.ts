import { describe, expect, it } from "vitest";

import demo from "../../demo/demo-props.json";
import { assignColors, PARTICIPANT_COLORS } from "../colors";
import { formatRange, initials, planDay } from "../format";
import { computeTimeline, FPS, separatorBefore } from "../timeline";
import type { ReelMessage, ReelProps } from "../types";

const props = demo as ReelProps;
const tz = "America/Los_Angeles";

describe("computeTimeline", () => {
  it("keeps the demo between 15 and 30 seconds with every scene in order", () => {
    const t = computeTimeline(props);
    expect(t.durationInFrames).toBeGreaterThanOrEqual(15 * FPS);
    expect(t.durationInFrames).toBeLessThanOrEqual(30 * FPS);
    expect(t.scenes[0].kind).toBe("title");
    expect(t.scenes[t.scenes.length - 1].kind).toBe("outro");
    expect(t.scenes.map((s) => s.kind)).toEqual(expect.arrayContaining(["chat", "highlight", "plans", "collage"]));
    for (let i = 1; i < t.scenes.length; i++) expect(t.scenes[i].from).toBe(t.scenes[i - 1].from + t.scenes[i - 1].duration);
  });

  it("lands bubbles in order, with typing before others' messages only", () => {
    const { beats } = computeTimeline(props);
    for (let i = 1; i < beats.length; i++) expect(beats[i].appearAt).toBeGreaterThan(beats[i - 1].appearAt);
    beats.forEach((b, i) => {
      if (props.messages[i].isMe) expect(b.typingAt).toBeNull();
      if (b.typingAt !== null) expect(b.typingAt).toBeLessThan(b.appearAt);
    });
  });

  it("chat segments cover chat time without gaps, around each highlight", () => {
    const t = computeTimeline(props);
    const chats = t.scenes.filter((s) => s.kind === "chat");
    let at = 0;
    for (const s of chats) {
      expect(s.chatFrom).toBe(at);
      at += s.duration;
    }
    expect(t.highlights).toEqual(props.highlights.slice(0, 2));
  });

  it("drops optional scenes and squeezes a long chat under 30 seconds", () => {
    const long: ReelProps = {
      ...props,
      photos: [],
      plans: [],
      messages: Array.from({ length: 35 }, (_, i) => ({ ...props.messages[i % props.messages.length], id: i + 1, ts: props.messages[0].ts + i * 60_000, skippedBefore: 0 })),
      highlights: [],
    };
    const t = computeTimeline(long);
    expect(t.scenes.some((s) => s.kind === "plans" || s.kind === "collage" || s.kind === "highlight")).toBe(false);
    expect(t.durationInFrames).toBeLessThanOrEqual(30 * FPS);
  });

  it("ignores highlight ids that are not shown text messages", () => {
    const photo = props.messages.find((m) => m.media)!;
    expect(computeTimeline({ ...props, highlights: [999_999, photo.id] }).highlights).toEqual([]);
  });
});

describe("separators", () => {
  const base: ReelMessage = { id: 1, sender: "Priya", isMe: false, text: "hi", ts: 0 };
  it("stamps the first message and long silences, marks bigger skips", () => {
    expect(separatorBefore(undefined, base)).toBe("time");
    expect(separatorBefore(base, { ...base, ts: 2 * 3_600_000 })).toBe("time");
    expect(separatorBefore(base, { ...base, ts: 60_000, skippedBefore: 5 })).toBe("skip");
    expect(separatorBefore(base, { ...base, ts: 60_000, skippedBefore: 1 })).toBeNull();
  });
});

describe("format", () => {
  it("prints date ranges the way the title card shows them", () => {
    expect(formatRange(Date.UTC(2026, 9, 14, 20), Date.UTC(2026, 9, 30, 20), tz)).toBe("Oct 14 – Oct 30, 2026");
    expect(formatRange(Date.UTC(2026, 11, 30, 20), Date.UTC(2027, 0, 2, 20), tz)).toBe("Dec 30, 2026 – Jan 2, 2027");
    expect(formatRange(Date.UTC(2026, 9, 14, 18), Date.UTC(2026, 9, 14, 22), tz)).toBe("Oct 14, 2026");
  });

  it("reads plan days without a zone shift", () => {
    expect(planDay("2026-12-24")).toEqual({ month: "Dec", day: "24" });
  });

  it("makes initials from names with emoji", () => {
    expect(initials("Priya Shah")).toBe("PS");
    expect(initials("jun 🌙")).toBe("JU");
  });
});

describe("assignColors", () => {
  it("is stable and never repeats a color within one chat", () => {
    const names = ["Priya", "Marcus", "Jun", "Me", "Ana", "Bo"];
    const a = assignColors(names);
    expect(assignColors([...names]).get("Jun")).toBe(a.get("Jun"));
    expect(new Set(a.values()).size).toBe(names.length);
    for (const c of a.values()) expect(PARTICIPANT_COLORS).toContain(c);
  });
});
