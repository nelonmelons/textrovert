import { describe, expect, it } from "vitest";

import {
  WrappedAnalysisContext, WrappedHeuristicProvider, addDays, characterCount, compareStrings, dateRange, dateRangeFromDays, dayDifference,
  fromWallTime, rangeDayCount, startOfDay, tokens, wordCount, type WrappedConversation,
} from "../src";

describe("calendar parity with Foundation", () => {
  it("whole local days with an exclusive end, in the given IANA zone", () => {
    const tz = "Asia/Kolkata";
    const r = dateRangeFromDays("2026-03-01", "2026-03-31", tz);
    expect(r.start).toBe(Date.UTC(2026, 1, 28, 18, 30));
    expect(r.end).toBe(Date.UTC(2026, 2, 31, 18, 30));
    expect(rangeDayCount(r)).toBe(31);
    expect(dateRange(fromWallTime(tz, 2026, 3, 1, 23, 59), fromWallTime(tz, 2026, 3, 31, 0, 1), tz)).toEqual(r);
  });

  it("days across spring-forward and fall-back are 23 and 25 hours long but count once", () => {
    const tz = "America/Los_Angeles";
    const r = dateRangeFromDays("2026-03-08", "2026-03-08", tz);
    expect(r.end - r.start).toBe(23 * 3_600_000);
    const fall = dateRangeFromDays("2026-11-01", "2026-11-01", tz);
    expect(fall.end - fall.start).toBe(25 * 3_600_000);
    expect(rangeDayCount(dateRangeFromDays("2026-03-01", "2026-11-30", tz))).toBe(275);
  });

  it("skipped wall times move forward by the gap; ambiguous ones take the earlier instant", () => {
    const tz = "America/Los_Angeles";
    expect(fromWallTime(tz, 2026, 3, 8, 2, 30)).toBe(fromWallTime(tz, 2026, 3, 8, 3, 30));
    expect(fromWallTime(tz, 2026, 11, 1, 1, 30)).toBe(Date.UTC(2026, 10, 1, 8, 30));
  });

  it("a zone whose midnight is skipped starts the day at the first instant that exists", () => {
    const tz = "America/Santiago";
    const day = startOfDay(Date.UTC(2026, 8, 6, 15), tz);
    expect(new Date(day).toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(addDays(day, 1, tz) - day).toBe(24 * 3_600_000);
    expect(dayDifference(day, addDays(day, 3, tz), tz)).toBe(3);
  });
});

describe("text parity with Swift strings", () => {
  it("counts grapheme clusters as characters", () => {
    expect(characterCount("👍🏽")).toBe(1);
    expect(characterCount("👨‍👩‍👧")).toBe(1);
    expect(characterCount("e\u0301")).toBe(1);
    expect(characterCount("🇺🇸ok")).toBe(3);
  });

  it("tokenizes Unicode letters and digits, keeping apostrophes inside words", () => {
    expect(tokens("Café'S ‘quote’ 東京 ٣٤ x—y 😂lol")).toEqual(["café's", "quote", "東京", "٣٤", "x", "y", "lol"]);
    expect(tokens("e\u0301te\u0301")).toEqual(["e\u0301te\u0301"]);
    expect(wordCount("  two\u00a0words\nand\tmore ")).toBe(4);
  });

  it("orders strings by code point like Swift, not by UTF-16 unit", () => {
    expect(compareStrings("\u{FF5E}", "\u{1F600}")).toBeLessThan(0);
    expect("\u{FF5E}" < "\u{1F600}").toBe(false);
  });

  it("matches the clock pattern with ICU word boundaries and Unicode digits", () => {
    const owner = { id: "emma", name: "Emma" }, kai = { id: "kai", name: "Kai Moss" };
    const tz = "America/Los_Angeles";
    const at = (h: number, m: number) => fromWallTime(tz, 2026, 11, 3, h, m);
    const conversation = (text: string): WrappedConversation => ({
      id: "kai", service: "iMessage", participants: [owner, kai],
      messages: [
        { id: "k-1", senderID: "kai", text, sentAt: at(9, 0) },
        { id: "k-2", senderID: "emma", text: "yes", sentAt: at(9, 1) },
      ],
    });
    const score = (text: string) => {
      const ctx = WrappedAnalysisContext.create(conversation(text), "emma", dateRangeFromDays("2026-11-01", "2026-11-14", tz))!;
      return new WrappedHeuristicProvider().invitations(ctx)[0]?.score;
    };
    expect(score("want to get lunch tomorrow at 1")).toBe(2 + 0.7 + 1 + 0.5);
    expect(score("want to get lunch tomorrow at ١")).toBe(2 + 0.7 + 1 + 0.5);
    expect(score("want to get lunch tomorrow at 1é")).toBe(2 + 1 + 0.5);
  });
});
