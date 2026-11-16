import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { snapchatParser } from "../snapchat";

const json = (value: unknown) => JSON.stringify(value);
const T = Date.UTC(2024, 0, 15, 21, 41, 5);

const row = (extra: Record<string, unknown>) => ({
  From: "samlee",
  "Media Type": "TEXT",
  Created: "2024-01-15 21:41:05 UTC",
  Content: "hey",
  "Conversation Title": null,
  IsSender: false,
  IsSaved: false,
  "Created(microseconds)": T * 1000,
  ...extra,
});

const chatHistory = {
  samlee: [
    row({ From: "kevinz", IsSender: true, Content: "yo \u{1F602}", Created: "2024-01-15 21:45:00 UTC", "Created(microseconds)": (T + 235_000) * 1000 + 123 }),
    row({}),
    row({ "Media Type": "IMAGE", Content: null, Created: "2024-01-15 21:50:00 UTC", "Created(microseconds)": (T + 535_000) * 1000 }),
    row({ "Media Type": "NOTE", Content: "", Created: "2024-01-15 21:51:00 UTC", "Created(microseconds)": 0 }),
    row({ "Media Type": "STATUSCALLMISSED", Content: null, Created: "2024-01-15 22:00:00 UTC", "Created(microseconds)": 0 }),
    row({ "Media Type": "TEXT", Content: null }),
  ],
  "3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab": [
    row({ From: "kevinz", IsSender: true, Content: "plan?", "Conversation Title": "Ski trip", Created: "2024-02-01 10:00:00 UTC", "Created(microseconds)": 0 }),
    row({ From: "alex_1", Content: "yes", "Conversation Title": "Ski trip", Created: "2024-02-01 10:01:00 UTC", "Created(microseconds)": 0 }),
    row({ From: "jo", "Media Type": "STICKER", Content: null, "Conversation Title": "Ski trip", Created: "2024-02-01 10:02:00 UTC", "Created(microseconds)": 0 }),
  ],
};

describe("snapchat", () => {
  it("parses chat_history.json with friends and account files", async () => {
    const run = await runParser(snapchatParser, {
      "mydata~123/json/chat_history.json": json(chatHistory),
      "mydata~123/json/friends.json": json({ Friends: [{ Username: "samlee", "Display Name": "Sam Lee", "Creation Timestamp": "x" }] }),
      "mydata~123/json/account.json": json({ "Basic Information": { Username: "kevinz", Name: "Kevin Z" } }),
      "mydata~123/json/snap_history.json": "{}",
      "mydata~123/html/chat_history.html": "<html>",
    });

    expect(run.claimed).toEqual([
      "mydata~123/json/friends.json",
      "mydata~123/json/account.json",
      "mydata~123/json/chat_history.json",
    ]);
    expect(run.selfHints).toEqual(["kevinz", "Kevin Z"]);

    expect(run.conversations.get("samlee")).toMatchObject({
      title: "Sam Lee",
      kind: "dm",
      selfName: "kevinz",
      participants: expect.arrayContaining(["kevinz", "samlee"]),
    });
    const dm = run.messages.get("samlee")!;
    expect(dm.map((m) => m.kind)).toEqual(["text", "text", "media", "media", "call"]);
    expect(dm[0]).toMatchObject({ sender: "samlee", text: "hey", ts: T });
    expect(dm[1]).toMatchObject({ sender: "kevinz", text: "yo \u{1F602}", ts: T + 235_000 });
    expect(dm[2]).toMatchObject({ meta: { media: ["photo"] }, text: null, ts: T + 535_000 });
    expect(dm[3]).toMatchObject({ meta: { media: ["audio"] }, text: null, ts: Date.UTC(2024, 0, 15, 21, 51) });
    expect(dm[4]).toMatchObject({ kind: "call", text: null });

    const group = run.conversations.get("3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab")!;
    expect(group).toMatchObject({ title: "Ski trip", kind: "group", selfName: "kevinz" });
    expect(group.participants.sort()).toEqual(["alex_1", "jo", "kevinz"]);
    const groupMessages = run.messages.get(group.externalId)!;
    expect(groupMessages.map((m) => m.sender)).toEqual(["kevinz", "alex_1", "jo"]);
    expect(groupMessages[2].meta).toEqual({ media: ["sticker"] });
  });

  it("falls back to the username when friends.json has no display name and ignores a missing account file", async () => {
    const run = await runParser(snapchatParser, { "json/chat_history.json": json({ bob: [row({ From: "bob" })] }) });
    expect(run.conversations.get("bob")).toMatchObject({ title: "bob", kind: "dm", selfName: null });
    expect(run.selfHints).toEqual([]);
  });

  it("accepts a plain username to display name map in friends.json", async () => {
    const run = await runParser(snapchatParser, {
      "json/chat_history.json": json({ bob: [row({ From: "bob" })] }),
      "json/friends.json": json({ bob: "Bobby" }),
    });
    expect(run.conversations.get("bob")!.title).toBe("Bobby");
  });

  it("reads the older Received/Sent Saved Chat History layout", async () => {
    const run = await runParser(snapchatParser, {
      "json/chat_history.json": json({
        "Received Saved Chat History": [{ From: "amy", "Media Type": "TEXT", Created: "2020-03-04 05:06:07 UTC", Content: "hi" }],
        "Sent Saved Chat History": [{ To: "amy", "Media Type": "TEXT", Created: "2020-03-04 05:07:00 UTC", Content: "hello" }],
      }),
      "json/account.json": json({ "Basic Information": { Username: "kevinz" } }),
    });
    expect(run.conversations.get("amy")).toMatchObject({ kind: "dm", selfName: "kevinz", participants: ["amy", "kevinz"] });
    expect(run.messages.get("amy")!.map((m) => [m.sender, m.text])).toEqual([
      ["amy", "hi"],
      ["kevinz", "hello"],
    ]);
  });

  it("streams a large multi-conversation file across chunk boundaries", async () => {
    const many: Record<string, unknown[]> = {};
    for (let c = 0; c < 20; c++) {
      many["friend_" + c + '"quoted'] = Array.from({ length: 150 }, (_, i) => row({ From: "friend_" + c, Content: "m" + i + " \u00e9 {not} [json]", Created: "2024-01-15 21:41:05 UTC" }));
    }
    const run = await runParser(snapchatParser, { "json/chat_history.json": json(many) }, { chunkSize: 4096 });
    expect(run.conversations.size).toBe(20);
    expect(run.messages.get('friend_3"quoted')).toHaveLength(150);
    expect(run.messages.get('friend_3"quoted')![0].text).toBe("m0 \u00e9 {not} [json]");
  });

  it("does not claim look-alike files from other platforms", async () => {
    const run = await runParser(snapchatParser, {
      "messages/c1/messages.json": "[]",
      "json/friends.json": json({ Friends: [] }),
      "json/account.json": json({ "Basic Information": { Username: "x" } }),
      "chat_history.json": json({ a: [{ From: "x" }] }),
      "result.json": json({ chats: { list: [] } }),
      "conversations.json": "[]",
    });
    expect(run.claimed).toEqual([]);
  });
});
