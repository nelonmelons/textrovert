import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Complete, ConversationRef } from "../assistant/agent";
import { answerRequest, ApiError, friendProfile, friendRoute, friendStory, portraitJson, REELS_ON_DESKTOP, type FriendContext } from "../assistant/api";
import { EpisodeIndex, type Episode } from "../assistant/episodes";
import { FactIndex, type Fact } from "../assistant/facts";
import type { Embed } from "../assistant/memory";
import { PortraitCache } from "../portrait/cache";
import { MessageStore } from "../store";

const T0 = Date.UTC(2026, 8, 1, 18);
const MIN = 60_000;
const DAY = 86_400_000;
const owner = "me";
const conversations: ConversationRef[] = [
  { id: "id-juno", key: "k-juno", title: "Juno Reyes", platform: "instagram", kind: "dm", participants: ["Juno Reyes", "Alex"], selfName: "Alex", messageCount: 6, lastAt: T0 + 40 * DAY },
  { id: "id-loft", key: "k-loft", title: "Loft crew", platform: "instagram", kind: "group", participants: ["Juno Reyes", "Kit Malone", "Alex"], selfName: "Alex", messageCount: 3, lastAt: T0 + 2 * DAY },
  { id: "id-kit", key: "k-kit", title: "Kit Malone", platform: "instagram", kind: "dm", participants: ["Kit Malone", "Alex"], selfName: "Alex", messageCount: 1, lastAt: T0 },
];
const embed: Embed = async (texts) => texts.map((t) => [/lantern/i.test(t) ? 1 : 0.01, 0.5]);

let dir: string;
let ctx: FriendContext;
const id: Record<string, number> = {};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "friends-test-"));
  const client = createClient({ url: "file:" + join(dir, "db") });
  const store = new MessageStore(client);
  const episodes = new EpisodeIndex(client);
  const facts = new FactIndex(client);
  const cache = new PortraitCache(client);
  await Promise.all([store.migrate(), episodes.migrate(), facts.migrate(), cache.migrate()]);
  const rows: [string, string, number, string, string][] = [
    ["hello", "k-juno", T0, "Juno Reyes", "hiii"],
    ["lantern", "k-juno", T0 + MIN, "Juno Reyes", "i really want one of those paper lanterns from the night fair"],
    ["noted", "k-juno", T0 + 2 * MIN, "Alex", "noted, adding it to the list"],
    ["kayak", "k-juno", T0 + 3 * MIN, "Juno Reyes", "also kayaking saturday at 9?"],
    ["yes", "k-juno", T0 + 4 * MIN, "Alex", "yes!!"],
    ["back", "k-juno", T0 + 40 * DAY, "Juno Reyes", "back from the coast, my ankle is fine now"],
    ["loft1", "k-loft", T0 + 2 * DAY, "Kit Malone", "who is coming to the rooftop thing friday"],
    ["loft2", "k-loft", T0 + 2 * DAY + MIN, "Juno Reyes", "me! bringing the speaker"],
    ["loft3", "k-loft", T0 + 2 * DAY + 2 * MIN, "Alex", "same"],
    ["kit", "k-kit", T0, "Kit Malone", "unrelated chat"],
  ];
  await store.insert(owner, rows.map(([uid, conversation, ts, sender, text]) => ({ uid, conversation, ts, sender, kind: "text", text, meta: null })));
  for (const c of ["k-juno", "k-loft", "k-kit"]) for (const m of await store.page(owner, c, 50, null)) id[rows.find((r) => r[4] === m.text)![0]] = m.id;

  const episode = (over: Partial<Episode>): Episode => ({
    conversation: "k-juno", startTs: T0, endTs: T0 + 4 * MIN, firstId: id.hello, maxId: id.yes, messageCount: 5, senders: ["Juno Reyes", "Me"],
    title: "Lanterns and kayaks", summary: "Juno wants a paper lantern; kayaking Saturday.", topics: ["kayaking", "night fair", "logistics"], people: [],
    places: [], plans: [{ what: "Kayaking", date: "2026-09-05", when: "saturday at 9", who: ["Juno Reyes", "Me"], sources: [id.kayak] }], mood: "planning", kind: "logistics", ...over,
  });
  await episodes.add(owner, [
    episode({}),
    episode({ conversation: "k-loft", startTs: T0 + 2 * DAY, endTs: T0 + 2 * DAY + 2 * MIN, firstId: id.loft1, maxId: id.loft3, messageCount: 3, senders: ["Kit Malone", "Juno Reyes", "Me"], title: "Rooftop Friday", topics: ["rooftop", "kayaking"], plans: [{ what: "Rooftop party", date: null, when: "friday", who: ["Juno", "Kit Malone"], sources: [id.loft1] }, { what: "Kit's dentist", date: null, when: "monday", who: ["Kit Malone"], sources: [id.loft1] }] }),
    episode({ conversation: "k-kit", firstId: id.kit, maxId: id.kit, messageCount: 1, senders: ["Kit Malone"], title: "Kit only", topics: ["chess"], plans: [] }),
  ], embed);

  const fact = (over: Partial<Fact>): Fact => ({ conversation: "k-juno", subject: "Juno", predicate: "wants", object: "", messageId: 0, quoteStart: 0, quoteEnd: 0, quote: "", validFrom: T0, validTo: null, ...over });
  await facts.add(owner, [
    fact({ object: "a paper lantern from the night fair", messageId: id.lantern, quote: "paper lanterns from the night fair", validFrom: T0 + MIN }),
    fact({ predicate: "health", object: "hurt ankle", messageId: id.back, quote: "my ankle is fine now", validFrom: T0 + 40 * DAY }),
    fact({ conversation: "k-kit", subject: "Juno", predicate: "likes", object: "chess", messageId: id.kit, quote: "unrelated", validFrom: T0 }),
  ], embed, async () => ({ duplicateOf: null, invalidates: [] }));

  ctx = { conversations, owner, store, episodes, facts, cache, timeZone: "America/Los_Angeles", writeStory: null };
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("GET /friend", () => {
  it("returns facts, plans, moments and topics from their chats, each with its source message", async () => {
    const friend = await friendProfile("juno reyes", ctx);
    expect(friend.person).toMatchObject({ name: "Juno Reyes", dm: true, chats: 2 });
    expect(friend.dmConversationId).toBe("id-juno");
    expect(friend.chats.map((c) => [c.id, c.isDm])).toEqual([["id-juno", true], ["id-loft", false]]);
    expect(friend.facts).toEqual([
      expect.objectContaining({ predicate: "wants", object: "a paper lantern from the night fair", messageId: id.lantern, quote: "paper lanterns from the night fair", validTo: null, source: expect.objectContaining({ messageId: id.lantern, sender: "Juno Reyes", fromMe: false, chat: "Juno Reyes", isDm: true, text: "i really want one of those paper lanterns from the night fair" }) }),
    ]);
    expect(friend.plans.map((p) => [p.what, p.source.messageId])).toEqual([["Rooftop party", id.loft1], ["Kayaking", id.kayak]]);
    expect(friend.episodes.map((e) => [e.title, e.chat, e.source.messageId])).toEqual([["Rooftop Friday", "Loft crew", id.loft1], ["Lanterns and kayaks", "Juno Reyes", id.hello]]);
    expect(friend.topics).toEqual([{ topic: "kayaking", count: 2 }, { topic: "night fair", count: 1 }, { topic: "rooftop", count: 1 }]);
    expect(friend.story).toBeNull();
  });

  it("answers 404 for someone not in the chats and 400 without a name", async () => {
    await expect(friendProfile("Nobody", ctx)).rejects.toMatchObject({ status: 404 });
    await expect(friendRoute("GET", "/friend", new URLSearchParams(), null, ctx, null)).rejects.toBeInstanceOf(ApiError);
    expect(await friendRoute("GET", "/elsewhere", new URLSearchParams(), null, ctx, null)).toBeNull();
  });
});

describe("GET /story", () => {
  it("writes the memoir once, keeps only footnotes in their chats, numbers them, and caches it", async () => {
    let calls = 0;
    let prompt = "";
    const write = async (_system: string, user: string) => {
      calls++;
      prompt = user;
      return {
        headline: "Lanterns and lakes",
        chapters: [
          { title: "The fair", sentences: [{ text: "You promised a lantern (#" + id.lantern + ").", refs: [id.lantern] }, { text: "Kit played chess.", refs: [id.kit] }] },
          { title: "Rooftop", sentences: [{ text: "Juno brought the speaker.", refs: [id.loft2, 999_999] }] },
        ],
      };
    };
    const withWriter = { ...ctx, writeStory: write };
    expect(await friendRoute("GET", "/story", new URLSearchParams("name=Juno Reyes"), null, ctx, null).catch((e) => e.status)).toBe(503);
    const { story } = await friendStory("Juno Reyes", withWriter);
    expect(prompt).toContain("Friend: Juno Reyes");
    expect(prompt).not.toContain("unrelated chat");
    expect(story?.headline).toBe("Lanterns and lakes");
    expect(story?.chapters.map((c) => c.sentences.map((s) => [s.n, s.text, s.refs]))).toEqual([[[1, "You promised a lantern.", [id.lantern]]], [[2, "Juno brought the speaker.", [id.loft2]]]]);
    expect(story?.sources[id.loft2]).toMatchObject({ chat: "Loft crew", isDm: false, text: "me! bringing the speaker" });
    await friendStory("juno reyes", withWriter);
    expect(calls).toBe(1);
    expect((await friendProfile("Juno Reyes", ctx)).story?.chapters).toHaveLength(2);
  });
});

describe("GET /portrait", () => {
  it("builds the portrait with cached memoirs and serves it from the cache until the data changes", async () => {
    const first = await portraitJson(ctx);
    const portrait = JSON.parse(first.text);
    expect(portrait.people.map((p: { name: string }) => p.name).sort()).toEqual(["Juno Reyes", "Kit Malone"]);
    expect(portrait.stories).toEqual([expect.objectContaining({ person: "juno-reyes", headline: "Lanterns and lakes" })]);
    expect(portrait.receipts[id.loft2]).toMatchObject({ sender: "Juno Reyes", conversation: "Loft crew" });
    expect((await portraitJson(ctx)).text).toBe(first.text);
    await ctx.store.insert(owner, [{ uid: "new", conversation: "k-kit", ts: T0 + 50 * DAY, sender: "Kit Malone", kind: "text", text: "new one", meta: null }]);
    expect((await portraitJson(ctx)).text).not.toBe(first.text);
  });
});

describe("POST /ask context", () => {
  it("gives each citation its neighbouring messages and whether it is a DM", async () => {
    let step = 0;
    const complete: Complete = async () =>
      step++ === 0
        ? { content: null, tool_calls: [{ id: "a", type: "function", function: { name: "search_messages", arguments: JSON.stringify({ query: "lanterns" }) } }] }
        : { content: null, tool_calls: [{ id: "b", type: "function", function: { name: "answer", arguments: JSON.stringify({ answer: "Juno wants a paper lantern [1].", citations: [{ n: 1, message_id: id.lantern, quote: "paper lanterns" }] }) } }] };
    const out = await answerRequest({ question: "what does Juno want?" }, { ...ctx, memory: null, embed: null, complete, now: T0 + 60 * DAY });
    expect(out.citations).toEqual([
      expect.objectContaining({
        messageId: id.lantern,
        isDm: true,
        before: [{ sender: "Juno Reyes", fromMe: false, sentAt: new Date(T0).toISOString(), text: "hiii" }],
        after: [
          { sender: "Alex", fromMe: true, sentAt: new Date(T0 + 2 * MIN).toISOString(), text: "noted, adding it to the list" },
          { sender: "Juno Reyes", fromMe: false, sentAt: new Date(T0 + 3 * MIN).toISOString(), text: "also kayaking saturday at 9?" },
        ],
      }),
    ]);
  });
});

describe("/reel", () => {
  it("answers unavailable without a renderer and validates the episode id", async () => {
    expect(await friendRoute("POST", "/reel", new URLSearchParams(), { episodeId: 3 }, ctx, null)).toEqual(REELS_ON_DESKTOP);
    const renderer = { status: (episodeId: number) => ({ status: "none" as const, episodeId }), start: (episodeId: number) => ({ status: "rendering" as const, episodeId }) };
    expect(await friendRoute("POST", "/reel", new URLSearchParams(), { episodeId: 3 }, ctx, renderer)).toEqual({ status: "rendering", episodeId: 3 });
    expect(await friendRoute("GET", "/reel", new URLSearchParams("episodeId=3"), null, ctx, renderer)).toEqual({ status: "none", episodeId: 3 });
    await expect(friendRoute("GET", "/reel", new URLSearchParams("episodeId=x"), null, ctx, renderer)).rejects.toMatchObject({ status: 400 });
  });
});
