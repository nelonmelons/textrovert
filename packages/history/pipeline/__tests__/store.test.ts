import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MessageStore, toFtsQuery, type MessageRow } from "../store";

let dir: string;
let store: MessageStore;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "store-test-"));
  store = new MessageStore(createClient({ url: "file:" + join(dir, "messages.db") }));
  await store.migrate();
  await store.migrate();
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const row = (conversation: string, ts: number, sender: string, text: string | null): MessageRow => ({
  uid: conversation + "-" + ts + "-" + sender + "-" + text,
  conversation,
  ts,
  sender,
  kind: text ? "text" : "media",
  text,
  meta: null,
});

describe("MessageStore", () => {
  const rows = [
    row("c1", 1000, "Sam", "pizza tonight?"),
    row("c1", 2000, "Kevin", "yes pizza 🍕"),
    row("c1", 3000, "Sam", null),
    row("c2", 1500, "Ana", "pizzeria downtown"),
  ];

  it("skips rows it already has and keeps owners apart", async () => {
    expect(await store.insert("alice", rows)).toBe(4);
    expect(await store.insert("alice", rows)).toBe(0);
    expect(await store.insert("bob", rows.slice(0, 1))).toBe(1);
    expect(await store.count("alice")).toBe(4);
    expect(await store.count("alice", "c1")).toBe(3);
  });

  it("pages newest first and continues from a cursor", async () => {
    const first = await store.page("alice", "c1", 2, null);
    expect(first.map((m) => m.ts)).toEqual([3000, 2000]);
    const next = await store.page("alice", "c1", 2, { ts: first[1].ts, id: first[1].id });
    expect(next.map((m) => m.text)).toEqual(["pizza tonight?"]);
  });

  it("scans conversations chronologically across pages, including ties and empty ones", async () => {
    const many = [5, 1, 3, 3, 2, 4, 6].map((ts, i) => ({ ...row("c3", ts, "Sam", "msg " + i) }));
    await store.insert("alice", many);
    const chunks = [];
    for await (const chunk of store.scan("alice", ["c3", "missing", "c1"], 3)) chunks.push(chunk);
    expect(chunks.map((c) => [c.conversation, c.messages.length, c.done])).toEqual([
      ["c3", 3, false],
      ["c3", 3, false],
      ["c3", 1, true],
      ["missing", 0, true],
      ["c1", 3, true],
    ]);
    expect(chunks.slice(0, 3).flatMap((c) => c.messages.map((m) => m.ts))).toEqual([1, 2, 3, 3, 4, 5, 6]);
  });

  it("returns a chronological window around a message", async () => {
    const [middle] = await store.page("alice", "c1", 1, { ts: 3000, id: Number.MAX_SAFE_INTEGER });
    const window = await store.around("alice", "c1", { ts: 2000, id: (await store.page("alice", "c1", 2, null))[1].id }, 3);
    expect(middle.ts).toBe(3000);
    expect(window.map((m) => m.ts)).toEqual([1000, 2000, 3000]);
  });

  it("searches by word prefix, per owner and per conversation", async () => {
    const hits = await store.search("alice", "pizz", 10);
    expect(hits.map((h) => h.conversation).sort()).toEqual(["c1", "c1", "c2"]);
    expect(hits.find((h) => h.sender === "Kevin")!.snippet).toBe("yes **pizza** 🍕");
    expect(await store.search("alice", "pizza", 10, "c2")).toEqual([]);
    expect(await store.search("bob", "pizza", 10)).toHaveLength(1);
    expect(await store.search("alice", "  ?! ", 10)).toEqual([]);
  });

  it("deletes everything an owner has, search index included", async () => {
    expect(await store.deleteOwner("bob")).toBe(1);
    expect(await store.search("bob", "pizza", 10)).toEqual([]);
    expect(await store.count("alice")).toBe(11);
  });
});

describe("toFtsQuery", () => {
  it("quotes every term so user input can't inject FTS syntax", () => {
    expect(toFtsQuery('hey "you" OR x*')).toBe('"hey" "you" "OR" "x"*');
    expect(toFtsQuery("¿?")).toBeNull();
  });
});

describe("MessageStore without FTS5", () => {
  it("still stores everything and falls back to substring search", async () => {
    const client = createClient({ url: "file:" + join(dir, "no-fts.db") });
    const noFts = {
      execute: (statement: Parameters<Client["execute"]>[0]) => client.execute(statement),
      batch: (statements: Parameters<Client["batch"]>[0], mode: Parameters<Client["batch"]>[1]) =>
        JSON.stringify(statements).includes("fts5") ? Promise.reject(new Error("no such module: fts5")) : client.batch(statements, mode),
    } as unknown as Client;
    const plain = new MessageStore(noFts);
    await plain.migrate();
    await plain.insert("alice", [row("c1", 1000, "Sam", "Pizza tonight? 100% yes"), row("c1", 2000, "Kevin", "no pizza for me"), row("c2", 3000, "Ana", "sushi")]);
    const hits = await plain.search("alice", "PIZZA", 10);
    expect(hits.map((h) => h.snippet)).toEqual(["no **pizza** for me", "**Pizza** tonight? 100% yes"]);
    expect(await plain.search("alice", "pizza yes", 10, "c1")).toHaveLength(1);
    expect(await plain.search("alice", "100%", 10)).toHaveLength(1);
  });
});
