import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ask, type Complete, type ConversationRef } from "../assistant/agent";
import { clusterVectors, describeEpisode, EpisodeIndex, segmentEpisodes, type Episode } from "../assistant/episodes";
import type { Embed } from "../assistant/memory";
import { MessageStore, type StoredMessage } from "../store";

const T0 = Date.UTC(2026, 9, 1, 18);
const MIN = 60_000;
const msg = (id: number, min: number, sender: string, text: string | null): StoredMessage => ({
  id, conversation: "k-trip", ts: T0 + min * MIN, sender, kind: text ? "text" : "media", text, meta: null,
});

describe("segmentEpisodes", () => {
  it("breaks at silences over 45 minutes", () => {
    const parts = segmentEpisodes([msg(1, 0, "a", "x"), msg(2, 30, "b", "y"), msg(3, 100, "a", "z")]);
    expect(parts.map((p) => p.map((m) => m.id))).toEqual([[1, 2], [3]]);
  });
});

describe("describeEpisode", () => {
  const messages = [msg(10, 0, "Ava", "shanghai dec 28?"), msg(11, 1, "Alex", "yes landing 4pm"), msg(12, 2, "Ava", "booking the apartment")];
  it("keeps only plans grounded in the episode's own messages and normalizes facets", async () => {
    const episode = await describeEpisode("k-trip", messages, (s) => (s === "Alex" ? "Me" : s), () => "2026-10-01 11:00", async (transcript) => {
      expect(transcript).toContain("#11 [2026-10-01 11:00] Me: yes landing 4pm");
      return {
        title: "Shanghai plans", summary: "Ava and Me plan Shanghai on Dec 28.", topics: ["travel"], people: ["Ava"], places: ["Shanghai"],
        plans: [
          { what: "Arrive in Shanghai", date: "2026-12-28", when: "dec 28 4pm", who: ["Me"], sources: [10, 11] },
          { what: "Invented plan", date: "2026-12-30", when: "", who: [], sources: [999] },
          { what: "Book apartment", date: "soon", when: "soon", who: ["Ava"], sources: [12] },
        ],
        mood: "planning", kind: "made-up kind",
      };
    });
    expect(episode).toMatchObject({ firstId: 10, maxId: 12, messageCount: 3, senders: ["Ava", "Me"], mood: "planning", kind: "small talk" });
    expect(episode!.plans).toEqual([
      { what: "Arrive in Shanghai", date: "2026-12-28", when: "dec 28 4pm", who: ["Me"], sources: [10, 11] },
      { what: "Book apartment", date: null, when: "soon", who: ["Ava"], sources: [12] },
    ]);
  });
  it("skips stretches with too little text to describe", async () => {
    expect(await describeEpisode("k", [msg(1, 0, "a", "hi"), msg(2, 1, "b", null)], (s) => s, () => "", async () => ({}))).toBeNull();
  });
});

describe("clusterVectors", () => {
  it("groups by direction and leaves distant points apart", () => {
    const clusters = clusterVectors([[1, 0, 0], [0.95, 0.05, 0], [0, 1, 0], [0.02, 0.98, 0], [0, 0, 1]], 0.3);
    expect(clusters.map((c) => c.sort())).toEqual([[0, 1], [2, 3], [4]]);
  });
});

describe("EpisodeIndex and the episode tools", () => {
  let dir: string;
  let store: MessageStore;
  let index: EpisodeIndex;
  const owner = "me";
  const embed: Embed = async (texts) => texts.map((t) => [/shanghai|trip/i.test(t) ? 1 : 0.01, /food|noodle/i.test(t) ? 1 : 0.01]);
  const episode = (over: Partial<Episode>): Episode => ({
    conversation: "k-trip", startTs: T0, endTs: T0 + MIN, firstId: 1, maxId: 1, messageCount: 3, senders: ["Ava", "Me"],
    title: "", summary: "", topics: [], people: [], places: [], plans: [], mood: "planning", kind: "logistics", ...over,
  });
  const conversations: ConversationRef[] = [
    { id: "id-trip", key: "k-trip", title: "Trip crew", platform: "instagram", kind: "group", participants: ["Ava", "Alex", "Jo"], selfName: "Alex", messageCount: 3, lastAt: T0 },
  ];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "episodes-test-"));
    const client = createClient({ url: "file:" + join(dir, "db") });
    store = new MessageStore(client);
    index = new EpisodeIndex(client);
    await store.migrate();
    await index.migrate();
    await store.insert(owner, [{ uid: "u1", conversation: "k-trip", ts: T0, sender: "Ava", kind: "text", text: "landing in shanghai dec 28 4pm", meta: null }]);
    const [stored] = await store.page(owner, "k-trip", 1, null);
    await index.add(owner, [
      episode({ title: "Shanghai trip dates", summary: "Ava lands in Shanghai Dec 28.", people: ["Ava"], maxId: stored.id, firstId: stored.id,
        plans: [{ what: "Ava lands in Shanghai", date: "2026-12-28", when: "dec 28 4pm", who: ["Ava"], sources: [stored.id] }] }),
      episode({ title: "Crab roe noodles", summary: "Everyone craves noodles.", mood: "wholesome", kind: "inside joke", startTs: T0 + 10 * MIN, endTs: T0 + 11 * MIN, people: ["Jo"] }),
    ], embed);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("filters by person and mood and ranks by meaning", async () => {
    expect((await index.find(owner, { person: "jo" }, 10)).map((e) => e.title)).toEqual(["Crab roe noodles"]);
    expect((await index.find(owner, { mood: "planning" }, 10)).map((e) => e.title)).toEqual(["Shanghai trip dates"]);
    const [top] = await index.find(owner, {}, 1, (await embed(["noodle food"]))[0]);
    expect(top.title).toBe("Crab roe noodles");
    expect(await index.find("someone-else", {}, 10)).toEqual([]);
  });

  it("lets the agent list upcoming plans and cite their source messages", async () => {
    let step = 0;
    let planOutput = "";
    const complete: Complete = async (messages) => {
      step++;
      if (step === 1) return { content: null, tool_calls: [{ id: "a", type: "function", function: { name: "list_plans", arguments: "{}" } }] };
      planOutput = String(messages.at(-1)!.content);
      const id = Number(/#(\d+) /.exec(planOutput)![1]);
      return { content: null, tool_calls: [{ id: "b", type: "function", function: { name: "answer", arguments: JSON.stringify({ answer: "Ava lands Dec 28 [1].", citations: [{ n: 1, message_id: id, quote: "shanghai dec 28 4pm" }] }) } }] };
    };
    const result = await ask({ question: "what's coming up?", conversations, owner, store, memory: null, episodes: index, embed, complete, timeZone: "America/Los_Angeles", now: Date.UTC(2026, 10, 15) });
    expect(planOutput).toContain("2026-12-28 (dec 28 4pm) Ava lands in Shanghai");
    expect(result.citations).toEqual([expect.objectContaining({ n: 1, sender: "Ava", quote: "shanghai dec 28 4pm" })]);
  });
});
