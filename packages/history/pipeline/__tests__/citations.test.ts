import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ask, bestSupport, pickQuote, tidyAnswer, verify, type Complete, type ConversationRef } from "../assistant/agent";
import { ApiError, chatsWith, listPeople, parseAskRequest } from "../assistant/api";
import { EpisodeIndex, type Episode } from "../assistant/episodes";
import type { Embed } from "../assistant/memory";
import { MessageStore, type StoredMessage } from "../store";

const T0 = Date.UTC(2026, 9, 1, 18);
const MIN = 60_000;
const owner = "me";
const conversations: ConversationRef[] = [
  { id: "id-crew", key: "k-crew", title: "Weekend crew", platform: "instagram", kind: "group", participants: ["Rory Vance", "Alex", "Tam Okafor"], selfName: "Alex", messageCount: 4, lastAt: T0 + 3 * MIN },
  { id: "id-tam", key: "k-tam", title: "Tam Okafor", platform: "instagram", kind: "dm", participants: ["Tam Okafor", "Alex"], selfName: "Alex", messageCount: 9, lastAt: T0 },
];
const embed: Embed = async (texts) => texts.map((t) => [/pottery|clay/i.test(t) ? 1 : 0.01, 0.5]);
const msg = (id: number, text: string, sender = "Rory Vance"): StoredMessage => ({ id, conversation: "k-crew", ts: T0 + id * MIN, sender, kind: "text", text, meta: null });

describe("episode citations", () => {
  let dir: string;
  let store: MessageStore;
  let episodes: EpisodeIndex;
  let ids: number[];
  let episodeId: number;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "citations-test-"));
    const client = createClient({ url: "file:" + join(dir, "db") });
    store = new MessageStore(client);
    episodes = new EpisodeIndex(client);
    await store.migrate();
    await episodes.migrate();
    const texts: [string, string][] = [
      ["Rory Vance", "morning all"],
      ["Alex", "should we do the pottery class again saturday"],
      ["Rory Vance", "yes my clay bowl from last time cracked lol"],
      ["Tam Okafor", "im in"],
    ];
    await store.insert(owner, texts.map(([sender, text], i) => ({ uid: "u" + i, conversation: "k-crew", ts: T0 + i * MIN, sender, kind: "text", text, meta: null })));
    ids = (await store.page(owner, "k-crew", 10, null)).map((m) => m.id).sort((a, b) => a - b);
    const episode: Episode = {
      conversation: "k-crew", startTs: T0, endTs: T0 + 3 * MIN, firstId: ids[0], maxId: ids[3], messageCount: 4, senders: ["Rory Vance", "Me", "Tam Okafor"],
      title: "Pottery again", summary: "Me and Rory want another pottery class; Rory's clay bowl cracked.", topics: ["pottery"], people: ["Rory Vance"],
      places: [], plans: [], mood: "planning", kind: "logistics",
    };
    await episodes.add(owner, [episode], embed);
    episodeId = (await episodes.find(owner, {}, 1))[0].id;
    await episodes.add(owner, [{ ...episode, conversation: "k-elsewhere", title: "Pottery in another chat", firstId: 900, maxId: 901 }], embed);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const askWith = (citation: Record<string, unknown>, answer = "You and Rory keep coming back to pottery [1].") => {
    let step = 0;
    const complete: Complete = async () =>
      step++ === 0
        ? { content: null, tool_calls: [{ id: "a", type: "function", function: { name: "find_episodes", arguments: JSON.stringify({ query: "what do we talk about" }) } }] }
        : { content: null, tool_calls: [{ id: "b", type: "function", function: { name: "answer", arguments: JSON.stringify({ answer, citations: [{ n: 1, ...citation }] }) } }] };
    return ask({ question: "what are Rory and I always talking about?", conversations, owner, store, memory: null, episodes, embed, complete, timeZone: "America/Los_Angeles", now: T0 + 60 * MIN });
  };

  it("resolves an episode_id citation to the message that best supports the claim", async () => {
    const out = await askWith({ episode_id: "E" + episodeId, quote: "pottery class" });
    expect(out.answer).toBe("You and Rory keep coming back to pottery [1].");
    expect(out.citations).toEqual([expect.objectContaining({ n: 1, messageId: ids[1], sender: "Alex", fromMe: true, quote: "pottery class" })]);
  });

  it("resolves an episode id passed as a message id", async () => {
    const out = await askWith({ message_id: episodeId, quote: "clay bowl" }, "Rory's bowl cracked [1].");
    expect(out.citations.map((c) => [c.messageId, c.quote])).toEqual([[ids[2], "clay bowl"]]);
  });

  it("accepts the starting message of an episode the agent was shown", async () => {
    const out = await askWith({ message_id: ids[3], quote: "im in" }, "Tam is in [1].");
    expect(out.citations.map((c) => c.messageId)).toEqual([ids[3]]);
  });

  it("keeps every tool inside the conversations it was given", async () => {
    let shown = "";
    let step = 0;
    const complete: Complete = async (messages) => {
      if (step++ === 0) return { content: null, tool_calls: [{ id: "a", type: "function", function: { name: "find_episodes", arguments: JSON.stringify({ query: "pottery" }) } }] };
      shown = String(messages.at(-1)!.content);
      return { content: null, tool_calls: [{ id: "b", type: "function", function: { name: "answer", arguments: JSON.stringify({ answer: "Pottery.", citations: [] }) } }] };
    };
    await ask({ question: "pottery?", conversations, owner, store, memory: null, episodes, embed, complete, timeZone: "UTC", now: T0 });
    expect(shown).toContain("Pottery again");
    expect(shown).not.toContain("another chat");
  });

  it("still drops ids the agent never saw", async () => {
    const out = await askWith({ message_id: 99_999, quote: "pottery" });
    expect(out.citations).toEqual([]);
    expect(out.answer).toBe("You and Rory keep coming back to pottery.");
  });
});

describe("bestSupport", () => {
  it("prefers a verbatim quote, then the most shared words", () => {
    const messages = [msg(1, "pottery?"), msg(2, "my clay bowl cracked"), msg(3, "brb")];
    expect(bestSupport(messages, "clay bowl")!.id).toBe(2);
    expect(bestSupport(messages, "the bowl Rory made cracked")!.id).toBe(2);
    expect(bestSupport(messages, "nothing related")).toBeNull();
  });
});

describe("tidyAnswer", () => {
  it("strips closing offers and follow-up menus", () => {
    expect(tidyAnswer("Rory is planning the trip [1]. If you want, I can pull the exact dates.")).toBe("Rory is planning the trip [1].");
    expect(tidyAnswer("Rory is planning the trip [1].\n\nWant me to list everything she said?")).toBe("Rory is planning the trip [1].");
    expect(tidyAnswer("Plans:\n- Pottery Saturday [1]\n\nWould you like me to check the DM too? Let me know if so.")).toBe("Plans:\n- Pottery Saturday [1]");
    expect(tidyAnswer("Tam lands on the 28th [8].\n\nAnything in that you want me to pull message-by-message?")).toBe("Tam lands on the 28th [8].");
    expect(tidyAnswer("If you want to go, Tam said Saturday works [2].")).toBe("If you want to go, Tam said Saturday works [2].");
  });

  it("removes raw message, episode and chat ids", () => {
    expect(tidyAnswer("Tam said yes in message #5888 [1].")).toBe("Tam said yes [1].");
    expect(tidyAnswer("Tam said yes (message #5888) [1], and Rory agreed (#5890, #5891).")).toBe("Tam said yes [1], and Rory agreed.");
    expect(tidyAnswer("This came up in episode E12 and (c3).")).toBe("This came up and.");
    expect(tidyAnswer("You're #1 on the list [1].")).toBe("You're #1 on the list [1].");
  });

  it("calls the user you, not Me", () => {
    expect(tidyAnswer("You (Me) and Rory talk about pottery [1].")).toBe("You and Rory talk about pottery [1].");
    expect(tidyAnswer("Rory asked Me (you) to come. Me (you) said yes.")).toBe("Rory asked you to come. You said yes.");
  });
});

describe("quotes", () => {
  const long =
    "ok so the plan is we fly out friday morning and land around noon. then we check into the place near the beach and drop bags. after that dinner at the noodle spot Tam keeps talking about, reservations at 7.";

  it("caps a long exact quote at a word boundary, still an exact span of the message", () => {
    const q = pickQuote(long, long);
    expect(q.length).toBeLessThanOrEqual(120);
    expect(long.startsWith(q)).toBe(true);
    expect(q.endsWith(" ")).toBe(false);
  });

  it("falls back to the sentence matching the paraphrase, not the whole message", () => {
    expect(pickQuote(long, "dinner reservations at the noodle place")).toBe("after that dinner at the noodle spot Tam keeps talking about, reservations at 7.");
  });

  it("highlights a span in verify even when the model quoted most of the message", () => {
    const m = { ...msg(7, long), conversation: "k-crew" };
    const out = verify("They fly Friday [1].", [{ n: 1, message_id: 7, quote: long }], new Map([[7, m]]), new Map(conversations.map((c) => [c.key, c])));
    expect(out.citations[0].quote.length).toBeLessThanOrEqual(120);
    expect(long.includes(out.citations[0].quote)).toBe(true);
  });
});

describe("Ask API helpers", () => {
  it("validates requests", () => {
    expect(parseAskRequest({ question: "  hi ", person: " ", history: [{ role: "user", content: "x" }, { role: "system", content: "y" }] })).toEqual({
      question: "hi",
      person: undefined,
      history: [{ role: "user", content: "x" }],
    });
    expect(() => parseAskRequest({ question: "" })).toThrow(ApiError);
    expect(() => parseAskRequest([])).toThrow(ApiError);
  });

  it("lists people without the user and scopes by person", () => {
    expect(listPeople(conversations).map((p) => [p.name, p.dm, p.chats])).toEqual([
      ["Tam Okafor", true, 2],
      ["Rory Vance", false, 1],
    ]);
    expect(chatsWith(conversations, "rory vance").map((c) => c.id)).toEqual(["id-crew"]);
  });
});
