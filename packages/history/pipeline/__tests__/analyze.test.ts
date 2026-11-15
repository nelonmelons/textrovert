import { describe, expect, it } from "vitest";

import { closeness, ConversationAnalyzer } from "../analyze";
import type { StoredMessage } from "../store";
import { LocalTime } from "../time";

const la = new LocalTime("America/Los_Angeles");
const at = (day: number, hour: number, minute: number) => la.fromLocal(2024, 3, day, hour, minute, 0);
const msg = (ts: number, sender: string, text: string | null, kind: StoredMessage["kind"] = "text", meta: string | null = null) => ({
  ts,
  sender,
  kind,
  text,
  meta,
});

describe("ConversationAnalyzer", () => {
  it("computes sessions, replies, double texts, streaks, and local-time histograms", () => {
    const analyzer = new ConversationAnalyzer("dm", "Kevin", la);
    [
      msg(at(1, 9, 0), "Sam", "good morning! 😂"),
      msg(at(1, 9, 2), "Kevin", "morning lol"),
      msg(at(1, 9, 3), "Kevin", "coffee?"),
      msg(at(1, 9, 30), "Kevin", "hello??"),
      msg(at(1, 9, 31), "Sam", "yes coffee"),
      msg(at(2, 23, 30), "Kevin", "you up?"),
      msg(at(2, 23, 45), "Sam", "https://example.com look"),
      msg(at(5, 7, 0), "", "Sam changed the group name", "system"),
      msg(at(5, 7, 30), "Sam", null, "call"),
      msg(at(5, 8, 0), "Kevin", null, "media"),
    ].forEach((m) => analyzer.add(m));
    const s = analyzer.finish();

    expect(s).toMatchObject({ messages: 8, myMessages: 5, calls: 1, links: 1, sessions: 3, activeDays: 3, longestStreakDays: 2, longestGapDays: 2 });
    const kevin = s.participants.find((p) => p.name === "Kevin")!;
    const sam = s.participants.find((p) => p.name === "Sam")!;
    expect(kevin).toMatchObject({ isMe: true, messages: 5, initiations: 2, lastWords: 1, doubleTexts: 1, replies: 1, replyMedianSec: 120, laughs: 1, questions: 3, media: 1 });
    expect(sam).toMatchObject({ isMe: false, messages: 3, initiations: 1, lastWords: 2, replies: 2, replyMedianSec: 480, laughs: 1, emojis: 1 });
    expect(s.myReplyHistogram).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.theirReplyHistogram).toEqual([0, 1, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(s.hourly[9]).toBe(5);
    expect(s.hourly[23]).toBe(2);
    expect(s.weekday).toEqual([0, 0, 1, 0, 0, 5, 2]);
    expect(s.myHeatmap[5 * 24 + 9]).toBe(3);
    expect(s.monthly).toEqual([{ month: "2024-03", mine: 5, theirs: 3 }]);
    expect(s.topEmojis).toEqual([{ text: "😂", count: 1 }]);
    expect(s.myTopWords.map((w) => w.text).sort()).toEqual(["coffee", "hello", "morning"]);
    expect(s.ai).toBeNull();
  });

  it("counts prompts, not model output, for AI chats", () => {
    const analyzer = new ConversationAnalyzer("ai", "You", la);
    analyzer.add(msg(at(1, 10, 0), "You", "write a haiku about pizza"));
    analyzer.add(msg(at(1, 10, 1), "ChatGPT", "Cheese melts slowly / ...", "text", JSON.stringify({ model: "gpt-4o" })));
    analyzer.add(msg(at(1, 10, 2), "You", "shorter"));
    const s = analyzer.finish();
    expect(s.ai).toEqual({ prompts: 2, responses: 1, avgPromptWords: 3, models: [{ text: "gpt-4o", count: 1 }] });
    expect(s.topWords.map((w) => w.text)).not.toContain("cheese");
  });
});

describe("closeness", () => {
  const stats = (overrides: Partial<ReturnType<ConversationAnalyzer["finish"]>>) => {
    const base = new ConversationAnalyzer("dm", "me", la).finish();
    return { ...base, ...overrides };
  };
  const now = Date.UTC(2024, 5, 1);
  const recentBalanced = stats({ messages: 2000, myMessages: 1000, firstAt: Date.UTC(2023, 5, 1), lastAt: now, monthly: new Array(12).fill({ month: "x", mine: 1, theirs: 1 }), participantCount: 2 });
  const oldOneSided = { ...recentBalanced, myMessages: 1900, lastAt: Date.UTC(2023, 0, 1) };

  it("ranks a recent, balanced chat above an old, one-sided one and ignores AI chats", () => {
    expect(closeness("dm", recentBalanced, now)).toBeGreaterThan(closeness("dm", oldOneSided, now));
    expect(closeness("group", recentBalanced, now)).toBeLessThan(closeness("dm", recentBalanced, now));
    expect(closeness("ai", recentBalanced, now)).toBe(0);
  });
});
