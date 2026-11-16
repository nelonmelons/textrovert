import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { discordParser } from "../discord";

const json = (value: unknown) => JSON.stringify(value);
const snowflake = (ms: number) => String((BigInt(ms) - 1420070400000n) << 22n);

const files = {
  "package/account/user.json": json({ id: "1", username: "kevin", global_name: "Kevin Z", discriminator: 0 }),
  "package/messages/index.json": json({
    "100": "Direct Message with sam#0",
    "200": "general in Study Group",
    "300": "Unknown channel",
    "400": "Direct Message with sam#0, alex#0",
  }),
  "package/messages/c100/channel.json": json({ id: "100", type: 1, recipients: ["1", "2"] }),
  "package/messages/c100/messages.json": json([
    { ID: "11", Timestamp: "2024-01-15 21:41:05.123000+00:00", Contents: "hey sam \u{1F602}", Attachments: "" },
    { ID: "12", Timestamp: "2024-01-15 21:42:00+00:00", Contents: "", Attachments: "https://cdn.discordapp.com/attachments/1/2/cat.png?ex=1&is=2" },
    {
      ID: "13",
      Timestamp: "2024-01-15 21:43:00.5+00:00",
      Contents: "look at these",
      Attachments: "https://cdn.discordapp.com/attachments/1/2/a.mp4 https://cdn.discordapp.com/attachments/1/2/b.pdf",
    },
    { ID: "14", Timestamp: "2024-01-15 21:44:00+00:00", Contents: "", Attachments: "" },
  ]),
  "package/messages/c200/channel.json": json({ id: "200", type: 0, name: "general", guild: { id: "9", name: "Study Group" } }),
  "package/messages/c200/messages.json": json([{ ID: "21", Timestamp: "2024-02-01 10:00:00+00:00", Contents: "notes are up", Attachments: "" }]),
  "package/messages/c300/channel.json": json({ id: "300", type: "PUBLIC_THREAD", name: "thread-x", guild: { id: "9", name: "Study Group" } }),
  "package/messages/c300/messages.json": json([{ ID: "31", Timestamp: "2024-02-02 10:00:00+00:00", Contents: "in thread", Attachments: "" }]),
  "package/messages/c400/channel.json": json({ id: "400", type: 3, name: "weekend", recipients: ["1", "2", "3"] }),
  "package/messages/c400/messages.json": json([{ ID: "41", Timestamp: "2024-02-03 10:00:00+00:00", Contents: "who's coming", Attachments: "" }]),
};

describe("discord", () => {
  it("parses a data package: DMs, group DMs, guild channels and threads", async () => {
    const run = await runParser(discordParser, files);

    expect(run.claimed).toContain("package/messages/c100/messages.json");
    expect(run.claimed).toContain("package/account/user.json");
    expect(run.selfHints).toEqual(["Kevin Z", "kevin"]);
    expect(run.conversations.get("100")).toMatchObject({ title: "sam", kind: "dm", participants: ["Kevin Z"], selfName: "Kevin Z" });
    expect(run.conversations.get("200")).toMatchObject({ title: "general in Study Group", kind: "group", selfName: "Kevin Z" });
    expect(run.conversations.get("300")).toMatchObject({ title: "thread-x in Study Group", kind: "group" });
    expect(run.conversations.get("400")).toMatchObject({ title: "weekend", kind: "group" });

    const messages = run.messages.get("100")!;
    expect(messages.map((m) => m.kind)).toEqual(["text", "media", "text"]);
    expect(messages.every((m) => m.sender === "Kevin Z")).toBe(true);
    expect(messages[0]).toMatchObject({ text: "hey sam \u{1F602}", ts: Date.UTC(2024, 0, 15, 21, 41, 5, 123) });
    expect(messages[1]).toMatchObject({ text: null, meta: { media: ["photo"] } });
    expect(messages[2]).toMatchObject({ text: "look at these", meta: { media: ["video", "file"] }, ts: Date.UTC(2024, 0, 15, 21, 43, 0, 500) });
  });

  it("reads old CSV packages with quoted multiline contents, falling back to You and the channel id snowflake", async () => {
    const csv = [
      "ID,Timestamp,Contents,Attachments",
      '1,2020-08-25 22:54:05.726000+00:00,"he said ""hi"",',
      'then left",',
      "2,2020-08-25 22:55:00+00:00,,https://cdn.discordapp.com/attachments/1/2/clip.mov",
      "3,,fallback via id," ,
    ].join("\r\n");
    const ts = Date.UTC(2021, 5, 1, 12, 0, 0);
    const run = await runParser(
      discordParser,
      {
        "messages/555/messages.csv": csv.replace("3,,", snowflake(ts) + ",,"),
        "messages/index.json": json({ "555": "general in Dream World" }),
      },
      { chunkSize: 5 },
    );
    expect(run.claimed).toEqual(["messages/index.json", "messages/555/messages.csv"]);
    expect(run.conversations.get("555")).toMatchObject({ title: "general in Dream World", kind: "group", participants: ["You"], selfName: "You" });
    const messages = run.messages.get("555")!;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ sender: "You", text: 'he said "hi",\nthen left', ts: Date.UTC(2020, 7, 25, 22, 54, 5, 726) });
    expect(messages[1]).toMatchObject({ kind: "media", text: null, meta: { media: ["video"] } });
    expect(messages[2]).toMatchObject({ text: "fallback via id", ts });
  });

  it("falls back to the DM label when channel.json is missing", async () => {
    const run = await runParser(discordParser, {
      "messages/c9/messages.json": json([{ ID: "1", Timestamp: "2024-01-01 00:00:00+00:00", Contents: "x", Attachments: "" }]),
      "messages/index.json": json({ "9": "Direct Message with sam#0" }),
    });
    expect(run.conversations.get("9")).toMatchObject({ title: "sam", kind: "dm" });
  });

  it("keeps two packages in one upload apart", async () => {
    const mk = (name: string) => ({
      ["a/" + name + "/account/user.json"]: json({ username: name }),
      ["a/" + name + "/messages/c1/messages.json"]: json([{ ID: "1", Timestamp: "2024-01-01 00:00:00+00:00", Contents: name, Attachments: "" }]),
    });
    const run = await runParser(discordParser, { ...mk("one"), ...mk("two") });
    expect(run.messages.get("1")!.map((m) => m.sender)).toEqual(["one", "two"]);
  });

  it("does not claim look-alike files from other platforms", async () => {
    const run = await runParser(discordParser, {
      "messages/inbox/sam_1/message_1.json": json({ participants: [], messages: [] }),
      "messages/c1/messages.json": json({ not: "an array" }),
      "messages/index.json": "{}",
      "account/user.json": json({ username: "x" }),
      "json/chat_history.json": "{}",
      "Takeout/messages/123/messages.csv": "sender,text\na,b",
    });
    expect(run.claimed).toEqual([]);
  });

  it("warns and continues when a channel file is broken", async () => {
    const run = await runParser(discordParser, {
      "messages/c1/messages.json": '[{"ID":"1","Timestamp":"2024-01-01 00:00:00+00:00","Contents":"a"',
      "messages/c2/messages.json": json([{ ID: "1", Timestamp: "2024-01-01 00:00:00+00:00", Contents: "ok", Attachments: "" }]),
    });
    expect(run.messages.get("2")).toHaveLength(1);
    expect(run.messages.get("1") ?? []).toHaveLength(0);
  });
});
