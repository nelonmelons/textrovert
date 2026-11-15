import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { whatsappParser } from "../whatsapp";

const LRM = "\u200e";
const NNBSP = "\u202f";

describe("whatsapp", () => {
  it("parses an iOS export and takes the title from the upload name", async () => {
    const chat = [
      `[1/15/24, 9:41:05${NNBSP}PM] Sam Lee: ${LRM}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
      `[1/15/24, 9:41:05${NNBSP}PM] Sam Lee: hey!! are we still on for tmrw`,
      `[1/15/24, 9:43:10${NNBSP}PM] Kevin: yes 😂 see you at 7`,
      `multi line too`,
      `[1/15/24, 9:44:00${NNBSP}PM] Sam Lee: ${LRM}image omitted`,
      `[1/16/24, 12:02:00${NNBSP}AM] Kevin: ${LRM}<attached: 00000012-PHOTO-2024-01-16-00-02-00.jpg>`,
      `[1/16/24, 8:00:00${NNBSP}AM] Sam Lee: ${LRM}Missed voice call, ${LRM}Tap to call back`,
    ].join("\n");
    const run = await runParser(whatsappParser, { "_chat.txt": chat }, { archiveName: "WhatsApp Chat - Sam Lee.zip" });

    expect(run.claimed).toEqual(["_chat.txt"]);
    const [conversation] = [...run.conversations.values()];
    expect(conversation).toMatchObject({ title: "Sam Lee", kind: "dm", participants: ["Sam Lee", "Kevin"] });
    const messages = run.messages.get(conversation.externalId)!;
    expect(messages.map((m) => m.kind)).toEqual(["system", "text", "text", "media", "media", "call"]);
    expect(messages[1]).toMatchObject({ sender: "Sam Lee", text: "hey!! are we still on for tmrw", ts: Date.UTC(2024, 0, 15, 21, 41, 5) });
    expect(messages[2].text).toBe("yes 😂 see you at 7\nmulti line too");
    expect(messages[3].meta).toEqual({ media: ["photo"] });
    expect(messages[4]).toMatchObject({ sender: "Kevin", ts: Date.UTC(2024, 0, 16, 0, 2, 0), meta: { media: ["photo"] } });
  });

  it("parses an Android group export with day-first dates", async () => {
    const chat = [
      "12/03/2023, 14:05 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.",
      '12/03/2023, 14:05 - Alice created group "Weekend Crew"',
      "12/03/2023, 14:06 - Alice: who's in for saturday?",
      "13/03/2023, 09:15 - Bob: me!",
      "bringing snacks",
      "13/03/2023, 09:16 - Carol: <Media omitted>",
      "13/03/2023, 09:20 - Bob: This message was deleted",
      "13/03/2023, 09:21 - Alice: see you there <This message was edited>",
      "13/03/2023, 09:22 - Carol: IMG-20230313-WA0001.jpg (file attached)",
      "the view",
    ].join("\r\n");
    const run = await runParser(whatsappParser, { "chats/WhatsApp Chat with Weekend Crew.txt": chat });

    const conversation = run.conversations.get("title:weekend crew")!;
    expect(conversation).toMatchObject({ title: "Weekend Crew", kind: "group", participants: ["Alice", "Bob", "Carol"] });
    const messages = run.messages.get("title:weekend crew")!;
    expect(messages.map((m) => m.kind)).toEqual(["system", "system", "text", "text", "media", "deleted", "text", "media"]);
    expect(messages[3]).toMatchObject({ text: "me!\nbringing snacks", ts: Date.UTC(2023, 2, 13, 9, 15) });
    expect(messages[6]).toMatchObject({ text: "see you there", meta: { edited: true } });
    expect(messages[7]).toMatchObject({ text: "the view", meta: { media: ["photo"] } });
  });

  it("reads month-first 12-hour Android dates in the user's time zone", async () => {
    const chat = ["1/2/24, 9:05 PM - Sam: hi", "1/2/24, 12:30 AM - Kevin: late"].join("\n");
    const run = await runParser(whatsappParser, { "WhatsApp Chat with Sam.txt": chat }, { timeZone: "America/Los_Angeles" });
    const messages = run.messages.get("title:sam")!;
    expect(messages[0].ts).toBe(Date.UTC(2024, 0, 3, 5, 5));
    expect(messages[1].ts).toBe(Date.UTC(2024, 0, 2, 8, 30));
  });

  it("ignores text files that are not WhatsApp exports", async () => {
    const run = await runParser(whatsappParser, { "notes.txt": "grocery list\n- eggs", "readme.md": "x" });
    expect(run.claimed).toEqual([]);
  });

  it("keeps separate chats apart when one upload holds several _chat.txt files", async () => {
    const run = await runParser(
      whatsappParser,
      { "a/_chat.txt": "[1/15/24, 9:41:05 PM] A: hi", "b/_chat.txt": "[1/15/24, 9:41:05 PM] B: yo" },
      { archiveName: "WhatsApp Chat - Sam.zip" },
    );
    expect([...run.conversations.values()].map((c) => c.title)).toEqual(["", ""]);
    expect(run.conversations.size).toBe(2);
  });
});
