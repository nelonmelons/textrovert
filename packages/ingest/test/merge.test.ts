import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIMessage } from "../src/imessage.ts";
import { mergeConversations } from "../src/merge.ts";

const block = (ts: string, who: string, text: string) => `${ts}\n${who}\n${text}\n\n`;

test("merges an incremental export into stored history without duplicates", () => {
  const old = parseIMessage(block("May 17, 2022  5:29:42 PM", "Jamie", "hey") + block("May 17, 2022  5:31:10 PM", "Me", "yo"));
  const recent = parseIMessage(
    block("May 17, 2022  5:31:10 PM", "Me", "yo") +
      "    May 17, 2022  6:02:00 PM\n    Jamie\n    later\n\n" +
      block("May 17, 2022  6:00:00 PM", "Me", "dinner?") +
      block("May 17, 2022  6:02:00 PM", "Jamie", "later") +
      "This message responded to an earlier message.\n\n",
  );
  const merged = mergeConversations(old, recent);
  assert.deepEqual(merged.messages.map((m) => [m.i, m.senderId, m.text, m.replyTo]), [
    [0, "jamie", "hey", undefined],
    [1, "me", "yo", undefined],
    [2, "me", "dinner?", undefined],
    [3, "jamie", "later", 1],
  ]);
});
