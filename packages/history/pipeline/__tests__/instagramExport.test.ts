import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analyzeStoredConversations } from "../analyze";
import { openArchive } from "../archive";
import { ingestArchive } from "../ingest";
import { buildPeople, type ConversationSummary } from "../insights";
import { instagramParser } from "../parsers/meta";
import { MessageStore } from "../store";
import { runParser } from "../testing";
import { LocalTime } from "../time";
import { slimZip } from "../../../mobile/src/api/slimZip";
import { FOLDERS, GROUP_TITLE, instagramFiles, JORDAN, LEA, mediaPaths, otherFiles, OWNER, RAVI } from "./fixtures/instagram";

const TZ = "America/Los_Angeles";
let dir: string;
let store: MessageStore;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "instagram-export-"));
  store = new MessageStore(createClient({ url: "file:" + join(dir, "messages.db") }));
  await store.migrate();
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** A full "Download your information" zip: messages, media beside them, and the other top-level folders. */
async function exportZip(format: "json" | "html", name: string, onlyMessages = false): Promise<string> {
  const files: Record<string, Uint8Array> = {};
  const text = { ...instagramFiles(format), ...(onlyMessages ? {} : otherFiles(format)) };
  for (const [path, content] of Object.entries(text)) files[path] = strToU8(content);
  for (const path of mediaPaths()) files[path] = jpeg;
  if (!onlyMessages) files["media/posts/202609/17890000000000001.jpg"] = jpeg;
  const keep = Object.entries(files).filter(([path]) => !onlyMessages || path.startsWith("your_instagram_activity/messages/"));
  const path = join(dir, name);
  await writeFile(path, zipSync(Object.fromEntries(keep), { level: 6 }));
  return path;
}

async function ingest(path: string, owner: string, selfNames: string[]) {
  const archive = await openArchive(path, path.slice(path.lastIndexOf("/") + 1));
  try {
    return await ingestArchive({ owner, archive, store, timeZone: TZ, selfNames });
  } finally {
    await archive.close();
  }
}

async function peopleOf(owner: string, result: Awaited<ReturnType<typeof ingest>>) {
  const summaries = new Map<string, ConversationSummary>(
    result.conversations.map((c) => [c.key, { key: c.key, platform: c.platform, kind: c.kind, title: c.title, selfName: c.selfName, closeness: 0, stats: null }]),
  );
  for await (const r of analyzeStoredConversations(store, owner, [...summaries.values()], new LocalTime(TZ), Date.UTC(2026, 10, 15))) {
    Object.assign(summaries.get(r.key)!, { stats: r.stats, closeness: r.closeness });
  }
  return buildPeople([...summaries.values()]).map((p) => p.name);
}

describe("Instagram 'Download your information' export", () => {
  it("reads the HTML export (Instagram's default) into the same messages as the JSON export", async () => {
    const json = await runParser(instagramParser, instagramFiles("json"), { timeZone: TZ });
    const html = await runParser(instagramParser, instagramFiles("html"), { timeZone: TZ });
    expect(html.warnings).toEqual([]);
    expect(html.selfHints).toEqual([OWNER.name, OWNER.username]);
    expect(json.selfHints).toEqual([OWNER.name, OWNER.username]);
    const sorted = (run: typeof json) => [...run.conversations.values()].map((c) => ({ ...c, participants: [...c.participants].sort() }));
    expect(sorted(html)).toEqual(sorted(json));
    expect([...html.messages.keys()]).toEqual([...json.messages.keys()]);
    for (const [id, messages] of json.messages) expect(html.messages.get(id), id).toEqual(messages);
  });

  it("leaves out message requests in both formats", async () => {
    for (const format of ["json", "html"] as const) {
      const files = instagramFiles(format);
      const run = await runParser(instagramParser, files, { timeZone: TZ });
      expect(run.claimed, format).toContain(`your_instagram_activity/messages/message_requests/${FOLDERS.request}/message_1.${format}`);
      expect([...run.conversations.keys()], format).toEqual([FOLDERS.jordan, FOLDERS.lea, FOLDERS.group]);
      expect(run.warnings, format).toEqual([]);
    }
  });

  it("decodes mojibake and keeps reactions, shares, photos, unsent messages and the group", async () => {
    const { conversations, messages } = await runParser(instagramParser, instagramFiles("json"), { timeZone: TZ });
    expect(conversations.get(FOLDERS.lea)).toMatchObject({ title: LEA, kind: "dm", participants: [LEA, OWNER.name] });
    expect(conversations.get(FOLDERS.group)).toMatchObject({ title: GROUP_TITLE, kind: "group" });
    expect(conversations.get(FOLDERS.group)!.participants.sort()).toEqual([JORDAN, LEA, OWNER.name, RAVI].sort());

    const lea = messages.get(FOLDERS.lea)!;
    expect(lea[0]).toMatchObject({ sender: LEA, kind: "text", text: "Salut Maya! On se voit au café à 19h? ☕" });
    expect(lea[3]).toMatchObject({ text: "LÉA!! congrats 🥳🥳", meta: { reactions: [{ sender: LEA, emoji: "😍" }] } });
    expect(lea.at(-1)).toMatchObject({ kind: "media", meta: { media: ["photo", "photo"] } });

    const jordan = messages.get(FOLDERS.jordan)!;
    expect(jordan).toHaveLength(238);
    expect(jordan.map((m) => m.ts)).toEqual([...jordan.map((m) => m.ts)].sort((a, b) => a - b));
    const tail = jordan.slice(-8);
    expect(tail[1]).toMatchObject({ text: "amazing!! I’ll bring the board games", meta: { reactions: [{ sender: JORDAN, emoji: "❤️" }] } });
    expect(tail[4]).toEqual({ ts: expect.any(Number), sender: OWNER.name, kind: "media", text: "https://www.instagram.com/reel/C0fakeReel01/", meta: { media: ["share"] } });
    expect(tail[6]).toMatchObject({ kind: "deleted", text: null });
    expect(tail[7]).toMatchObject({ kind: "media", meta: { media: ["video"] } });
  });

  for (const format of ["json", "html"] as const) {
    it(`ingests a full ${format.toUpperCase()} zip, names the owner from the profile and leaves them out of friends`, async () => {
      const owner = "ig-full-" + format;
      const result = await ingest(await exportZip(format, `instagram-full-${format}.zip`), owner, ["Maya"]);
      expect(result.sources).toEqual([{ platform: "instagram", files: 7, conversations: 3, messages: 252 }]);
      expect(result.messagesStored).toBe(252);
      for (const c of result.conversations) expect(c.selfName, c.title).toBe(OWNER.name);
      expect(result.conversations.map((c) => c.title).sort()).toEqual(["Jordan Kim", "Léa Dubois", "Tahoe Trip 🏔️"]);
      expect(await peopleOf(owner, result)).toEqual([JORDAN, LEA, RAVI]);
    });

    it(`ingests a ${format.toUpperCase()} zip of just the messages folder, with no profile file`, async () => {
      const owner = "ig-messages-" + format;
      const result = await ingest(await exportZip(format, `instagram-messages-${format}.zip`, true), owner, ["Maya"]);
      expect(result.messagesStored).toBe(252);
      for (const c of result.conversations) expect(c.selfName, c.title).toBe(OWNER.name);
      expect(await peopleOf(owner, result)).toEqual([JORDAN, LEA, RAVI]);
    });

    it(`ingests the ${format.toUpperCase()} zip the phone repacks without media and message requests`, async () => {
      const path = await exportZip(format, `instagram-full-${format}-for-slim.zip`);
      const original = await readFile(path);
      const chunks: Uint8Array[] = [];
      const size = await slimZip(
        { size: original.byteLength, read: async (offset, length) => original.subarray(offset, offset + length) },
        async (bytes) => void chunks.push(bytes.slice()),
      );
      expect(size).toBe(chunks.reduce((n, c) => n + c.byteLength, 0));
      const slimPath = join(dir, `instagram-slim-${format}.zip`);
      await writeFile(slimPath, Buffer.concat(chunks));
      const archive = await openArchive(slimPath, "slim.zip");
      const paths = archive.entries.map((e) => e.path);
      await archive.close();
      expect(paths.filter((p) => /\.(jpg|mp4)$|message_requests/.test(p))).toEqual([]);
      expect(paths).toContain(`your_instagram_activity/messages/inbox/${FOLDERS.jordan}/message_3.${format}`);
      const result = await ingest(slimPath, "ig-slim-" + format, ["Maya"]);
      expect(result.messagesStored).toBe(252);
      expect(await peopleOf("ig-slim-" + format, result)).toEqual([JORDAN, LEA, RAVI]);
    });
  }
});
