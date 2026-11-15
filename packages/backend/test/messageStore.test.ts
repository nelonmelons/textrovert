import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { parseIMessage, renderTranscript } from "@textrovert/ingest";
import { ensureSchema, getMessagePage, insertMessages, loadConversation, searchMessages, summarize } from "../convex/lib/messageStore.ts";

const block = (ts: string, who: string, text: string) => `${ts}\n${who}\n${text}\n\n`;
const first = parseIMessage(
  block("May 17, 2022  5:29:42 PM", "Jamie", "are we still on for saturday?") +
    block("May 17, 2022  5:31:10 PM", "Me", "yes booked the table") +
    "    May 17, 2022  6:02:00 PM\n    Jamie\n    perfect\n\n" +
    block("May 17, 2022  5:31:10 PM", "Me", "lol") +
    block("May 17, 2022  5:31:10 PM", "Me", "lol") +
    block("May 17, 2022  6:02:00 PM", "Jamie", "perfect") +
    "This message responded to an earlier message.\n\n",
);
const later = parseIMessage(block("May 17, 2022  6:02:00 PM", "Jamie", "perfect") + block("May 19, 2022  9:00:00 PM", "Jamie", "saturday was amazing"));

test("stores messages in SQLite, dedupes re-syncs, and rebuilds the conversation", async () => {
  const db = createClient({ url: "file::memory:" });
  await ensureSchema(db);
  await ensureSchema(db);
  const chat1 = { owner: "device-a", conversation: "imessage:Jamie" };
  assert.equal(await insertMessages(db, chat1, first), 5);
  assert.equal(await insertMessages(db, chat1, first), 0);
  assert.equal(await insertMessages(db, chat1, later), 1);
  assert.equal(await insertMessages(db, { owner: "device-a", conversation: "imessage:Sam" }, later), 2);
  assert.equal(await insertMessages(db, { owner: "device-b", conversation: "imessage:Jamie" }, later), 2);

  const meta = { source: "imessage" as const, title: "Jamie", isGroup: false, participants: first.participants };
  const conv = await loadConversation(db, chat1, meta);
  assert.deepEqual(conv.messages.map((m) => [m.i, m.senderId, m.text, m.replyTo]), [
    [0, "jamie", "are we still on for saturday?", undefined],
    [1, "me", "yes booked the table", undefined],
    [2, "me", "lol", undefined],
    [3, "me", "lol", undefined],
    [4, "jamie", "perfect", 1],
    [5, "jamie", "saturday was amazing", undefined],
  ]);
  assert.match(renderTranscript(conv), /\(replying to #1\) perfect/);
  assert.equal(summarize(conv).messageCount, 6);

  const page = await getMessagePage(db, chat1, 4, 10);
  assert.deepEqual([page.total, page.messages.map((m) => m.i)], [6, [4, 5]]);

  const hits = await searchMessages(db, "device-a", "saturday", ["imessage:Jamie"], 10);
  assert.deepEqual(hits.map((h) => [h.conversation, h.text, h.isSelf, h.ts]).sort(), [
    ["imessage:Jamie", "are we still on for saturday?", false, "2022-05-17T17:29:42"],
    ["imessage:Jamie", "saturday was amazing", false, "2022-05-19T21:00:00"],
  ]);
  assert.match(hits[0].snippet, /\[saturday\]/i);
  assert.deepEqual(await searchMessages(db, "device-a", "saturday", [], 10), []);
});
