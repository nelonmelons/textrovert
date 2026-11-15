import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIMessage } from "../src/imessage.ts";

const raw = readFileSync(new URL("./fixtures/imessage.txt", import.meta.url), "utf8");

test("parses imessage-exporter txt blocks in chronological order", () => {
  const conv = parseIMessage(raw);
  assert.deepEqual(
    conv.messages.map((m) => [m.ts, m.senderId, m.kind]),
    [
      ["2022-05-17T17:29:42", "jamie", "text"],
      ["2022-05-17T17:31:10", "me", "text"],
      ["2022-05-17T17:40:00", "jamie", "media"],
      ["2022-05-17T18:02:00", "jamie", "text"],
      ["2022-05-17T21:00:00", "system", "system"],
      ["2022-05-18T10:15:05", "me", "text"],
    ],
  );
  const [first, booked, , perfect, rename, last] = conv.messages;
  assert.deepEqual(first.reactions, [{ emoji: "❤️", by: "Me" }]);
  assert.equal(booked.readAfter, "3 minutes");
  assert.equal(perfect.replyTo, 1);
  assert.equal(rename.text, "Jamie named the conversation Saturday plans");
  assert.equal(last.text, "also\n\nthis has a blank line");
  assert.equal(conv.title, "Jamie");
});
