import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { csvParser } from "../csv";
import { imessageExporterParser } from "../imessageExporter";
import { whatsappParser } from "../whatsapp";

// Real imessage-exporter 5.0.1 "-f txt" output from a synthetic database, with a contact name resolved for one handle.
const dm = [
  "May 17, 2024  5:29:42 PM (Read by you after 5 minutes)",
  "Jamie Rivera",
  "hey are we still on for saturday?",
  "Tapbacks:",
  "    Loved by Me",
  "",
  "May 17, 2024  5:30:42 PM (Read by them after 4 minutes)",
  "Me",
  "yes!",
  "booked the table for 8",
  "",
  "see you there",
  "    May 17, 2024  5:31:42 PM",
  "    Jamie Rivera",
  "    perfect",
  "",
  "",
  "May 17, 2024  5:31:42 PM",
  "Jamie Rivera",
  "perfect",
  "This message responded to an earlier message.",
  "",
  "May 17, 2024  5:32:42 PM",
  "Jamie Rivera",
  "/Users/sam/Library/Messages/Attachments/ab/11/AB12CD34-0000-4000-8000-000000000001/IMG_1234.HEIC",
  "",
  "May 17, 2024  5:33:02 PM",
  "Me",
  "lol",
  "Sent with Loud",
  "Tapbacks:",
  "    🔥 by Jamie Rivera",
  "",
  "May 17, 2024  5:40:00 PM",
  "Me",
  "May 17, 2024  5:40:00 PM dinner at 7",
  "Edited 1 minute later: dinner at 8",
  "",
  "May 17, 2024  5:45:00 PM You unsent a message!",
  "",
  "May 17, 2024  5:46:00 PM",
  "Jamie Rivera",
  "Jamie Rivera unsent this message part 1 minute, 5 seconds after sending!",
  "",
  "May 18, 2024 10:15:05 AM",
  "Jamie Rivera",
  "Oh, il a traduit ce que j'ai envoyé !",
  "Translated from:",
  "Oh it translated what I sent!",
  "",
].join("\n");

const group = [
  "May 17, 2024  5:46:22 PM +15550002222 named the conversation Weekend Crew",
  "",
  "May 17, 2024  5:47:12 PM Jamie Rivera added riley@example.com to the conversation.",
  "",
  "May 17, 2024  5:48:02 PM",
  "Jamie Rivera",
  "who's in for the hike?",
  "    May 17, 2024  5:54:42 PM",
  "    riley@example.com",
  "    I'm in too",
  "    bringing snacks",
  "",
  "",
  "May 17, 2024  5:49:42 PM",
  "+15550002222",
  "me!",
  "",
  "May 17, 2024  5:51:22 PM",
  "Me",
  "count me in",
  "Tapbacks:",
  "    Laughed by riley@example.com",
  "",
  "May 17, 2024  5:54:42 PM",
  "riley@example.com",
  "I'm in too",
  "bringing snacks",
  "This message responded to an earlier message.",
  "",
].join("\n");

const unnamedGroup = [
  "May 17, 2024  6:03:02 PM",
  "+15550002222",
  "pizza tonight?",
  "",
  "May 17, 2024  6:04:42 PM",
  "riley@example.com",
  "yes",
  "",
].join("\n");

const orphaned = ["Feb 06, 2025  1:25:24 PM (Read by you after 2 minutes, 40 seconds)", "Unknown", "lost message", ""].join("\n");

const files = {
  "+15550001111.txt": dm,
  "Weekend Crew - 1.txt": group,
  "+15550002222, riley@example.com.txt": unnamedGroup,
  "orphaned.txt": orphaned,
};

describe("imessage-exporter txt", () => {
  it("parses a DM with multi-line text, replies once, tapbacks, attachments, edits and unsent messages", async () => {
    const run = await runParser(imessageExporterParser, files, { timeZone: "America/Los_Angeles" });

    expect(run.claimed).toEqual(["+15550001111.txt", "Weekend Crew - 1.txt", "+15550002222, riley@example.com.txt"]);
    expect(run.conversations.get("chat:+15550001111")).toMatchObject({
      title: "",
      kind: "dm",
      participants: ["Jamie Rivera", "Me"],
      selfName: "Me",
    });
    const messages = run.messages.get("chat:+15550001111")!;
    expect(messages.map((m) => m.kind)).toEqual(["text", "text", "text", "media", "text", "text", "deleted", "deleted", "text"]);
    expect(messages[0]).toEqual({
      ts: Date.UTC(2024, 4, 18, 0, 29, 42),
      sender: "Jamie Rivera",
      kind: "text",
      text: "hey are we still on for saturday?",
      meta: { reactions: [{ sender: "Me", emoji: "❤️" }] },
    });
    expect(messages[1]).toEqual({ ts: Date.UTC(2024, 4, 18, 0, 30, 42), sender: "Me", kind: "text", text: "yes!\nbooked the table for 8\n\nsee you there" });
    expect(messages.filter((m) => m.text === "perfect")).toHaveLength(1);
    expect(messages[3]).toMatchObject({ sender: "Jamie Rivera", text: null, meta: { media: ["photo"] } });
    expect(messages[4]).toEqual({ ts: Date.UTC(2024, 4, 18, 0, 33, 2), sender: "Me", kind: "text", text: "lol", meta: { reactions: [{ sender: "Jamie Rivera", emoji: "🔥" }] } });
    expect(messages[5]).toMatchObject({ sender: "Me", text: "dinner at 8", meta: { edited: true } });
    expect(messages[6]).toMatchObject({ sender: "Me", text: null });
    expect(messages[7]).toMatchObject({ sender: "Jamie Rivera", text: null });
    expect(messages[8]).toMatchObject({ ts: Date.UTC(2024, 4, 18, 17, 15, 5), text: "Oh it translated what I sent!" });
  });

  it("ends tapbacks at a threaded reply, so its read receipt and text aren't read as reactions", async () => {
    const chat = [
      "May 17, 2024  5:29:42 PM (Read by you after 5 minutes)",
      "Jamie Rivera",
      "did you get milk",
      "Tapbacks:",
      "    Liked by Me",
      "    May 17, 2024  5:35:00 PM (Read by you after 2 minutes, 3 seconds)",
      "    Me",
      "    stopped by the store",
      "",
      "",
      "May 17, 2024  5:35:00 PM (Read by them after 1 minute)",
      "Me",
      "stopped by the store",
      "This message responded to an earlier message.",
      "",
    ].join("\n");
    const run = await runParser(imessageExporterParser, { "+15550001111.txt": chat }, { timeZone: "America/Los_Angeles" });
    expect(run.conversations.get("chat:+15550001111")).toMatchObject({ kind: "dm", participants: ["Jamie Rivera", "Me"] });
    const messages = run.messages.get("chat:+15550001111")!;
    expect(messages.map((m) => [m.sender, m.text, m.meta?.reactions])).toEqual([
      ["Jamie Rivera", "did you get milk", [{ sender: "Me", emoji: "👍" }]],
      ["Me", "stopped by the store", undefined],
    ]);
  });

  it("parses named and unnamed groups with system lines and threaded replies", async () => {
    const run = await runParser(imessageExporterParser, files, { timeZone: "America/Los_Angeles" });

    expect(run.conversations.get("group:Weekend Crew")).toMatchObject({
      title: "Weekend Crew",
      kind: "group",
      participants: ["Jamie Rivera", "+15550002222", "Me", "riley@example.com"],
    });
    const messages = run.messages.get("group:Weekend Crew")!;
    expect(messages.slice(0, 2)).toEqual([
      { ts: Date.UTC(2024, 4, 18, 0, 46, 22), sender: "", kind: "system", text: "+15550002222 named the conversation Weekend Crew" },
      { ts: Date.UTC(2024, 4, 18, 0, 47, 12), sender: "", kind: "system", text: "Jamie Rivera added riley@example.com to the conversation." },
    ]);
    expect(messages.map((m) => m.text).slice(2)).toEqual(["who's in for the hike?", "me!", "count me in", "I'm in too\nbringing snacks"]);
    expect(messages[4].meta).toEqual({ reactions: [{ sender: "riley@example.com", emoji: "😂" }] });

    expect(run.conversations.get("chat:+15550002222, riley@example.com")).toMatchObject({ title: "", kind: "group" });
    expect(run.messages.get("chat:+15550002222, riley@example.com")).toHaveLength(2);
  });

  it("keeps conversation ids stable across re-exports", async () => {
    const first = await runParser(imessageExporterParser, files);
    const again = await runParser(imessageExporterParser, files);
    expect([...again.conversations]).toEqual([...first.conversations]);
    expect([...again.messages]).toEqual([...first.messages]);

    // Deleting an older chat renumbers "<name> - <n>", so the group keeps its id without the number...
    const renumbered = await runParser(imessageExporterParser, { "Weekend Crew - 0.txt": group });
    expect([...renumbered.conversations.keys()]).toEqual(["group:Weekend Crew"]);
    // ...unless two groups in one export share the name.
    const twins = await runParser(imessageExporterParser, { "Family - 2.txt": unnamedGroup, "Family - 5.txt": group });
    expect([...twins.conversations.keys()]).toEqual(["group:Family - 2", "group:Family - 5"]);
  });

  it("claims only exporter transcripts, and other text parsers leave them alone", async () => {
    const others = {
      "orphaned.txt": orphaned,
      "WhatsApp Chat with Sam.txt": "[1/15/24, 9:41:05 PM] Sam: hi\n[1/15/24, 9:42:00 PM] Kevin: yo",
      "messages.csv": "timestamp,sender,message\n2024-01-15 21:41:05,Sam,hi",
      "notes.txt": "May 17, 2024  5:29:42 PM\n\nnot a chat",
    };
    expect((await runParser(imessageExporterParser, others)).claimed).toEqual([]);
    expect((await runParser(whatsappParser, files)).claimed).toEqual([]);
    expect((await runParser(csvParser, files)).claimed).toEqual([]);
  });

  it("streams long chats in batches", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 2500; i++) lines.push("Nov 06, 2025 12:00:00 AM", i % 2 ? "Me" : "+15550000001", "message " + i, "");
    const run = await runParser(imessageExporterParser, { "+15550000001.txt": lines.join("\n") }, { chunkSize: 4096 });
    const messages = run.messages.get("chat:+15550000001")!;
    expect(messages).toHaveLength(2500);
    expect(messages[2499]).toMatchObject({ sender: "Me", text: "message 2499", ts: Date.UTC(2025, 10, 6) });
  });
});
