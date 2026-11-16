import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findCommonGround, findSharedChats, formatProfiles } from "../commonGround";
import type { ChatSource, Interest, InterestProfile } from "../interests";
import type { JsonRequest, Llm } from "../llm";
import { MessageStore, type MessageRow } from "../store";

const T0 = Date.UTC(2025, 2, 1, 18, 0, 0);
const MIN = 60_000;

let dir: string;
let store: MessageStore;

const row = (conversation: string, ts: number, sender: string, text: string): MessageRow => ({
  uid: [conversation, ts, sender, text].join("|"),
  conversation,
  ts,
  sender,
  kind: "text",
  text,
  meta: null,
});

// Kevin's history (iMessage: he is "You", others are phone numbers). Emma is +15550002.
const kevinChats: ChatSource[] = [
  { key: "k-emma", kind: "dm", selfName: "You", participants: ["You", "+15550002"] },
  { key: "k-sam", kind: "dm", selfName: "You", participants: ["You", "+15550004"] },
  { key: "k-trip", kind: "group", selfName: "You", participants: ["You", "+15550002", "+15550003"] },
  { key: "k-gpt", kind: "ai", selfName: "You", participants: ["You", "ChatGPT"] },
];
// Emma's history (WhatsApp: she is "Emma Di", Kevin is saved as "Kevin Z").
const emmaChats: ChatSource[] = [
  { key: "e-kevin", kind: "dm", selfName: "Emma Di", participants: ["Emma Di", "Kevin Z"] },
  { key: "e-pat", kind: "dm", selfName: "Emma Di", participants: ["Emma Di", "Pat"] },
  { key: "e-trip", kind: "group", selfName: "Emma Di", participants: ["Emma Di", "Kevin Z", "Lee"] },
];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "common-ground-test-"));
  store = new MessageStore(createClient({ url: "file:" + join(dir, "messages.db") }));
  await store.migrate();

  const dm: [number, "kevin" | "emma", string][] = [
    [0, "kevin", "did you finish the problem set already?"],
    [1, "emma", "almost, question 4 is brutal though"],
    [2, "kevin", "radiohead tickets go on sale friday!!"],
    [3, "emma", "omg yes radiohead at the greek would be insane"],
    [4, "kevin", "radiohead setlist leaked and it's all of ok computer"],
    [5, "emma", "see you in lecture tomorrow morning"],
  ];
  const trip: [number, "kevin" | "emma" | "lee", string][] = [
    [100, "lee", "who's driving to tahoe this weekend?"],
    [101, "kevin", "I can drive if someone brings snacks"],
    [102, "emma", "I'll bring snacks and the speaker"],
    [103, "lee", "radiohead playlist for the drive obviously"],
    [104, "emma", "the cabin has a hot tub right??"],
  ];
  await store.insert("kevin", [
    ...dm.map(([m, who, text]) => row("k-emma", T0 + m * MIN, who === "kevin" ? "You" : "+15550002", text)),
    ...trip.map(([m, who, text]) => row("k-trip", T0 + m * MIN, who === "kevin" ? "You" : who === "emma" ? "+15550002" : "+15550003", text)),
    row("k-sam", T0 + 5 * MIN + 1000, "+15550004", "see you in lecture tomorrow morning"),
    row("k-sam", T0 + 300 * MIN, "You", "going bouldering at mission cliffs, you in?"),
    row("k-gpt", T0 + 400 * MIN, "You", "radiohead discography ranked please"),
  ]);
  // Emma's export stamps the same messages a few seconds apart from Kevin's.
  await store.insert("emma", [
    ...dm.map(([m, who, text]) => row("e-kevin", T0 + m * MIN + 2000, who === "emma" ? "Emma Di" : "Kevin Z", text)),
    ...trip.map(([m, who, text]) => row("e-trip", T0 + m * MIN + 2000, who === "emma" ? "Emma Di" : who === "kevin" ? "Kevin Z" : "Lee", text)),
    row("e-pat", T0 + 600 * MIN, "Emma Di", "climbing gym after work? need to work on my bouldering"),
  ]);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("findSharedChats", () => {
  it("finds the DM and the group the two share by the messages that appear in both histories", async () => {
    const shared = await findSharedChats(store, { owner: "kevin", chats: kevinChats }, { owner: "emma", chats: emmaChats });
    expect(shared.a.keys.sort()).toEqual(["k-emma", "k-trip"]);
    expect(shared.a.otherSenders).toEqual(["+15550002"]);
    expect(shared.b.keys.sort()).toEqual(["e-kevin", "e-trip"]);
    expect(shared.b.otherSenders).toEqual(["Kevin Z"]);
  });

  it("counts a group the other person is in even when only one of their messages matched there", async () => {
    const quietGroup = emmaChats.map((c) => (c.key === "e-trip" ? { ...c, participants: ["Emma Di", "Lee"] } : c));
    const shared = await findSharedChats(store, { owner: "kevin", chats: kevinChats }, { owner: "emma", chats: quietGroup });
    expect(shared.b.keys.sort()).toEqual(["e-kevin", "e-trip"]);
  });

  it("finds nothing for two people who never texted each other", async () => {
    const shared = await findSharedChats(store, { owner: "kevin", chats: kevinChats.filter((c) => c.key === "k-sam") }, { owner: "emma", chats: emmaChats });
    expect(shared.a.keys).toEqual([]);
    expect(shared.b.keys).toEqual([]);
  });
});

const interest = (id: string, name: string, keywords: string[], mentions: number, extra: Partial<Interest> = {}): Interest => ({
  id,
  name,
  category: "other",
  summary: name + " summary",
  specifics: [],
  keywords,
  mentions,
  firstAt: T0,
  lastAt: T0,
  ...extra,
});

describe("findCommonGround", () => {
  const kevin: InterestProfile = {
    messages: 100,
    read: 100,
    interests: [
      interest("i1", "Radiohead", ["radiohead", "ok computer"], 40, { category: "music", specifics: ["Radiohead"] }),
      interest("i2", "rock climbing", ["bouldering", "mission cliffs"], 25, { category: "outdoors" }),
      interest("i3", "sourdough baking", ["sourdough"], 8, { category: "food & drink" }),
    ],
  };
  const emma: InterestProfile = {
    messages: 80,
    read: 80,
    interests: [
      interest("i1", "bouldering", ["bouldering", "climbing gym"], 12, { category: "outdoors", firstAt: T0 - 100 * MIN }),
      interest("i2", "Radiohead", ["radiohead"], 9, { category: "music" }),
      interest("i3", "pottery", ["pottery", "wheel throwing"], 5, { category: "arts & crafts" }),
    ],
  };

  it("keeps overlaps backed by both profiles and puts the ones that never came up between them first", async () => {
    const requests: JsonRequest[] = [];
    const llm = (async (request: JsonRequest) => {
      requests.push(request);
      return {
        shared: [
          { title: "Radiohead", category: "music", match: "same", a_ids: ["a1"], b_ids: ["b2"], a_detail: "has OK Computer on repeat", b_detail: "wants to see them live", keywords: ["radiohead"], starter: "Favorite Radiohead album?" },
          { title: "Climbing", category: "outdoors", match: "activity", a_ids: ["a2"], b_ids: ["b1"], a_detail: "boulders at Mission Cliffs", b_detail: "working on bouldering", keywords: ["climbing", "bouldering"], starter: "Want to boulder sometime?" },
          { title: "Baking", category: "food & drink", match: "related", a_ids: ["a3"], b_ids: ["b9"], a_detail: "bakes sourdough", b_detail: "invented", keywords: ["bread"], starter: "Bread?" },
          { title: "radiohead!", category: "music", match: "same", a_ids: ["a1"], b_ids: ["b2"], a_detail: "dupe", b_detail: "dupe", keywords: ["radiohead"], starter: "dupe" },
        ],
      };
    }) as Llm;

    const ground = await findCommonGround({
      store,
      llm,
      a: { owner: "kevin", chats: kevinChats, profile: kevin },
      b: { owner: "emma", chats: emmaChats, profile: emma },
    });

    expect(ground.sharedChats).toEqual({ a: 2, b: 2 });
    expect(ground.items.map((i) => [i.title, i.hidden, i.betweenYou])).toEqual([
      ["Climbing", true, 0],
      ["Radiohead", false, 3],
    ]);
    expect(ground.items[0].a).toEqual({ detail: "boulders at Mission Cliffs", mentions: 25, since: T0 });
    expect(ground.items[0].b).toEqual({ detail: "working on bouldering", mentions: 12, since: T0 - 100 * MIN });
    // The model sees the two profiles, never messages.
    expect(requests).toHaveLength(1);
    expect(requests[0].user).not.toContain("problem set");
    expect(requests[0].user).toContain("[a1] Radiohead (music)");
    expect(requests[0].user).toContain("Named by both: Radiohead, bouldering");
  });

  it("skips the model when one side has no interests", async () => {
    const llm = (async () => {
      throw new Error("should not be called");
    }) as Llm;
    const ground = await findCommonGround({
      store,
      llm,
      a: { owner: "kevin", chats: kevinChats, profile: kevin },
      b: { owner: "emma", chats: emmaChats, profile: { interests: [], messages: 0, read: 0 } },
    });
    expect(ground.items).toEqual([]);
  });
});

describe("formatProfiles", () => {
  it("numbers each side's interests for the model", () => {
    const text = formatProfiles([interest("i1", "chess", ["chess"], 3)], [interest("i1", "go", ["baduk"], 2)]);
    expect(text.split("\n")).toEqual([
      "Person A",
      "[a1] chess (other): chess summary 3 messages, 2025.",
      "",
      "Person B",
      "[b1] go (other): go summary 2 messages, 2025.",
    ]);
  });
});
