import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildInterestProfile,
  chunkMessages,
  distinctMessages,
  focusMessages,
  loadOwnMessages,
  selectWithinBudget,
  substantiveMessages,
  termMatcher,
  type OwnMessage,
} from "../interests";
import type { JsonRequest, Llm } from "../llm";
import { MessageStore, type MessageRow } from "../store";

const DAY = 86_400_000;
const at = (day: number) => Date.UTC(2024, 0, 1) + day * DAY;

describe("substantiveMessages and distinctMessages", () => {
  it("drop texts too short to say anything, shorten links to their site, and keep each distinct text once", () => {
    const kept = substantiveMessages([
      { ts: 1, text: "lol ok" },
      { ts: 2, text: "https://www.youtube.com/watch?v=abc123" },
      { ts: 3, text: "Going bouldering at Mission Cliffs tonight" },
      { ts: 4, text: "going   bouldering at mission cliffs tonight" },
      { ts: 5, text: "this album is unreal https://open.spotify.com/album/xyz" },
    ]);
    expect(kept).toEqual([
      { ts: 3, text: "Going bouldering at Mission Cliffs tonight" },
      { ts: 4, text: "going bouldering at mission cliffs tonight" },
      { ts: 5, text: "this album is unreal [link open.spotify.com]" },
    ]);
    expect(distinctMessages(kept).map((m) => m.ts)).toEqual([3, 5]);
  });
});

describe("selectWithinBudget", () => {
  const messages = Array.from({ length: 4000 }, (_, i) => ({ ts: at(i % 365), text: "message number " + i + " about something" }));

  it("keeps everything that fits", () => {
    expect(selectWithinBudget(messages, 10_000_000)).toBe(messages);
  });

  it("samples evenly and deterministically when the history is too big", () => {
    const total = messages.reduce((sum, m) => sum + m.text.length + 9, 0);
    const sample = selectWithinBudget(messages, total / 4);
    expect(sample.length).toBeGreaterThan(800);
    expect(sample.length).toBeLessThan(1200);
    expect(selectWithinBudget(messages, total / 4)).toEqual(sample);
    const firstHalf = sample.filter((m) => m.ts < at(183)).length;
    expect(firstHalf / sample.length).toBeGreaterThan(0.4);
    expect(firstHalf / sample.length).toBeLessThan(0.6);
  });
});

const SMALL_TALK = ["running late, see you soon", "want to grab dinner tonight", "omw be there in a bit", "did you see my last text", "going to bed now, night", "can you send me the notes"];
const smallTalk = (count: number) => Array.from({ length: count }, (_, i) => ({ ts: at(i % 700), text: SMALL_TALK[i % SMALL_TALK.length] + " " + i }));

describe("focusMessages", () => {
  const climbing = Array.from({ length: 12 }, (_, i) => ({ ts: at(i * 50 + 3), text: "bouldering at Mission Cliffs after class, round " + i }));
  const messages = [...smallTalk(4000), ...climbing, { ts: at(5), text: "frieren is so good" }, { ts: at(9), text: "frieren tonight?" }].sort((a, b) => a.ts - b.ts);

  it("picks a few messages about each rare but recurring topic, spread across time, and skips small talk", () => {
    const focus = focusMessages(messages, 1_000_000);
    expect(focus).toHaveLength(6);
    expect(focus.every((m) => m.text.startsWith("bouldering"))).toBe(true);
    expect(Math.max(...focus.map((m) => m.ts)) - Math.min(...focus.map((m) => m.ts))).toBeGreaterThan(300 * DAY);
  });

  it("stays within its budget", () => {
    expect(focusMessages(messages, 130)).toHaveLength(2);
  });

  it("finds nothing in a history too small to need it", () => {
    expect(focusMessages(climbing, 1_000_000)).toEqual([]);
  });
});

describe("chunkMessages", () => {
  it("prefixes each line with its month and keeps chunks under the size", () => {
    const chunks = chunkMessages(
      Array.from({ length: 50 }, (_, i) => ({ ts: at(i * 10), text: "x".repeat(90) })),
      1000,
    );
    expect(chunks.length).toBe(5);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks[0].split("\n")[0]).toBe("2024-01 " + "x".repeat(90));
  });
});

describe("termMatcher", () => {
  it("matches whole words, lets long words continue, and gives short ones only a plural", () => {
    const climb = termMatcher(["climb", "Mission Cliffs"])!;
    expect(climb.test("went climbing today")).toBe(true);
    expect(climb.test("mission   cliffs at 7?")).toBe(true);
    expect(climb.test("upclimb")).toBe(false);
    const art = termMatcher(["art"])!;
    expect(art.test("new arts class")).toBe(true);
    expect(art.test("party tonight")).toBe(false);
    expect(art.test("an article")).toBe(false);
    expect(termMatcher(["the", "ok"])).toBeNull();
    expect(termMatcher(["Café Réveille"])!.test("cafe reveille again")).toBe(true);
  });
});

/** A model stand-in: lists an interest for each keyword it finds in a chunk, and consolidates to fixed drafts. */
function fakeModel(drafts: object[], options: { failChunks?: number } = {}) {
  let failures = options.failChunks ?? 0;
  const requests: JsonRequest[] = [];
  const llm = (async (request: JsonRequest) => {
    requests.push(request);
    if (request.name === "interests") {
      if (failures-- > 0) throw new Error("rate limited");
      const interests = [];
      if (/boulder/i.test(request.user)) interests.push({ name: "bouldering", category: "outdoors", note: "boulders", specifics: ["Mission Cliffs"], keywords: ["bouldering"], messages: 3 });
      if (/radiohead/i.test(request.user)) interests.push({ name: "Radiohead", category: "music", note: "fan", specifics: ["Radiohead"], keywords: ["radiohead"], messages: 2 });
      return { interests };
    }
    return { interests: drafts };
  }) as Llm;
  return { llm, requests };
}

const history: OwnMessage[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ ts: at(i), text: "heading to Mission Cliffs for bouldering session " + i })),
  ...Array.from({ length: 6 }, (_, i) => ({ ts: at(40 + i), text: "Radiohead on repeat all week, part " + i })),
  ...Array.from({ length: 30 }, (_, i) => ({ ts: at(60 + i), text: "running a little late, see you soon " + i })),
];

describe("buildInterestProfile", () => {
  const drafts = [
    { name: "rock climbing", category: "outdoors", summary: "boulders at Mission Cliffs", specifics: ["Mission Cliffs"], keywords: ["bouldering", "climbing"] },
    { name: "Radiohead", category: "music", summary: "listens on repeat", specifics: [], keywords: ["radiohead"] },
    { name: "salsa dancing", category: "fitness", summary: "made up by the model", specifics: ["Club Havana"], keywords: ["salsa"] },
  ];

  it("keeps only interests the person's messages show, counting mentions across the whole history", async () => {
    const { llm, requests } = fakeModel(drafts);
    const profile = await buildInterestProfile(history, llm, { chunkChars: 800 });
    expect(profile.messages).toBe(66);
    expect(profile.read).toBe(66);
    expect(profile.interests.map((i) => [i.id, i.name, i.mentions])).toEqual([
      ["i1", "rock climbing", 30],
      ["i2", "Radiohead", 6],
    ]);
    expect(profile.interests[0].firstAt).toBe(at(0));
    expect(profile.interests[0].lastAt).toBe(at(29));
    const consolidation = requests.find((r) => r.name === "interest_profile")!;
    expect(consolidation.user).toContain("- bouldering [outdoors]");
    expect(consolidation.user).toContain("specifics: Mission Cliffs | keywords: bouldering");
  });

  it("still counts mentions in messages the model didn't read when the history is sampled", async () => {
    const { llm } = fakeModel(drafts);
    const profile = await buildInterestProfile(history, llm, { budgetChars: 1500, chunkChars: 800 });
    expect(profile.read).toBeLessThan(profile.messages);
    expect(profile.interests[0].mentions).toBe(30);
  });

  it("reads rare but recurring topics first, grouped together, even when the history is sampled", async () => {
    const { llm, requests } = fakeModel(drafts);
    const climbing = Array.from({ length: 12 }, (_, i) => ({ ts: at(i * 50 + 3), text: "bouldering at Mission Cliffs after class, round " + i }));
    const messages = [...smallTalk(4000), ...climbing].sort((a, b) => a.ts - b.ts);
    const profile = await buildInterestProfile(messages, llm, { budgetChars: 40_000, chunkChars: 4000 });
    expect(profile.read).toBeLessThan(profile.messages);
    expect(requests[0].user.split("\n").slice(0, 6).every((line) => line.includes("bouldering"))).toBe(true);
    expect(profile.interests[0]).toMatchObject({ name: "rock climbing", mentions: 12 });
  });

  it("drops what the model flags to skip, and keeps rare topics from the focus pass however many others there are", async () => {
    const requests: JsonRequest[] = [];
    const llm = (async (request: JsonRequest) => {
      requests.push(request);
      if (request.name === "interest_profile") {
        return {
          interests: [
            { name: "rock climbing", category: "fitness", skip: false, summary: "boulders", specifics: ["Mission Cliffs"], keywords: ["bouldering"] },
            { name: "running late", category: "other", skip: true, summary: "late a lot", specifics: [], keywords: ["running late"] },
          ],
        };
      }
      if (/bouldering/.test(request.user)) {
        return { interests: [{ name: "bouldering", category: "fitness", skip: false, note: "boulders", specifics: ["Mission Cliffs"], keywords: ["bouldering"], messages: 6 }] };
      }
      const call = requests.length;
      return {
        interests: [
          { name: "running late", category: "other", skip: true, note: "late a lot", specifics: [], keywords: ["running late"], messages: 400 },
          ...Array.from({ length: 30 }, (_, i) => ({ name: "small talk " + call + "-" + i, category: "other", skip: false, note: "", specifics: [], keywords: [], messages: 100 })),
        ],
      };
    }) as Llm;
    const climbing = Array.from({ length: 12 }, (_, i) => ({ ts: at(i * 50 + 3), text: "bouldering at Mission Cliffs after class, round " + i }));
    const profile = await buildInterestProfile([...smallTalk(4000), ...climbing].sort((a, b) => a.ts - b.ts), llm, { chunkChars: 4000 });
    const consolidation = requests.find((r) => r.name === "interest_profile")!.user;
    expect(consolidation.split("\n").length).toBeGreaterThan(250);
    expect(consolidation.split("\n").slice(0, 2)).toEqual(["Rare topics that keep coming back:", expect.stringContaining("- bouldering [fitness]")]);
    expect(consolidation).not.toContain("running late");
    expect(profile.interests.map((i) => [i.name, i.mentions])).toEqual([["rock climbing", 12]]);
  });

  it("doesn't count a one-word specific that has an everyday meaning", async () => {
    const llm = (async (request: JsonRequest) => {
      const warriors = { name: "Golden State Warriors", category: "sports", skip: false, specifics: ["Curry", "Chase Center"], keywords: ["warriors"] };
      return request.name === "interests"
        ? { interests: [{ ...warriors, note: "follows the team", messages: 4 }] }
        : { interests: [{ ...warriors, summary: "follows the team" }] };
    }) as Llm;
    const messages = [
      ...Array.from({ length: 10 }, (_, i) => ({ ts: at(i), text: "we should get curry tonight, round " + i })),
      ...Array.from({ length: 3 }, (_, i) => ({ ts: at(20 + i), text: "warriors game at chase center, round " + i })),
      { ts: at(30), text: "chase center was so loud last night" },
    ];
    const profile = await buildInterestProfile(messages, llm);
    expect(profile.interests.map((i) => [i.name, i.mentions])).toEqual([["Golden State Warriors", 4]]);
  });

  it("tolerates a few failed chunks but not many", async () => {
    await expect(buildInterestProfile(history, fakeModel(drafts, { failChunks: 1 }).llm, { chunkChars: 400 })).resolves.toBeTruthy();
    await expect(buildInterestProfile(history, fakeModel(drafts, { failChunks: 4 }).llm, { chunkChars: 1000 })).rejects.toThrow("rate limited");
  });

  it("reads a repeated text once but counts every time it was sent", async () => {
    const { llm, requests } = fakeModel(drafts);
    const repeated = [...history, ...Array.from({ length: 10 }, (_, i) => ({ ts: at(200 + i), text: "Radiohead on repeat all week, part 0" }))];
    const profile = await buildInterestProfile(repeated, llm, { chunkChars: 800 });
    expect(profile.messages).toBe(76);
    expect(profile.read).toBe(66);
    expect(profile.interests.find((i) => i.name === "Radiohead")!.mentions).toBe(16);
    expect(requests.filter((r) => r.name === "interests").every((r) => (r.user.match(/part 0$/gm) ?? []).length <= 1)).toBe(true);
  });

  it("returns an empty profile without calling the model when there's too little to read", async () => {
    const { llm, requests } = fakeModel(drafts);
    expect(await buildInterestProfile(history.slice(0, 3), llm)).toEqual({ interests: [], messages: 3, read: 0 });
    expect(requests).toHaveLength(0);
  });
});

describe("loadOwnMessages", () => {
  let dir: string;
  let store: MessageStore;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "interests-test-"));
    store = new MessageStore(createClient({ url: "file:" + join(dir, "messages.db") }));
    await store.migrate();
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("reads only what the user sent in chats with people", async () => {
    const row = (conversation: string, ts: number, sender: string, text: string): MessageRow => ({
      uid: conversation + ts + sender,
      conversation,
      ts,
      sender,
      kind: "text",
      text,
      meta: null,
    });
    await store.insert("me", [
      row("dm", 3, "You", "climbing at Mission Cliffs later"),
      row("dm", 1, "+15550001", "want to climb later today?"),
      row("dm", 2, "You", "ok"),
      row("group", 4, "Kevin", "sourdough attempt number three"),
      row("ai", 5, "You", "explain the rules of cricket to me"),
      row("unknown", 6, "Someone", "who am I in this chat anyway"),
    ]);
    const messages = await loadOwnMessages(store, "me", [
      { key: "dm", kind: "dm", selfName: "You", participants: ["You", "+15550001"] },
      { key: "group", kind: "group", selfName: "Kevin", participants: ["Kevin"] },
      { key: "ai", kind: "ai", selfName: "You", participants: ["You", "ChatGPT"] },
      { key: "unknown", kind: "group", selfName: null, participants: ["Someone"] },
    ]);
    expect(messages).toEqual([
      { ts: 3, text: "climbing at Mission Cliffs later" },
      { ts: 4, text: "sourdough attempt number three" },
    ]);
  });
});
