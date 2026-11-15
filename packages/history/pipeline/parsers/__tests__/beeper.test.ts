import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { BEEPER_FORMAT, beeperParsers, beeperPlatform, type BeeperChatFile } from "../beeper";

const chat = (platform: BeeperChatFile["platform"], network: string): BeeperChatFile => ({
  format: BEEPER_FORMAT,
  platform,
  chat: {
    id: "!room:beeper.com",
    title: "Weekend Crew",
    type: "group",
    network,
    participants: [
      { id: "u1", name: "Nelson", isSelf: true },
      { id: "u2", name: "Emma Di", isSelf: false },
    ],
  },
  messages: [
    { id: "m2", senderID: "u1", senderName: null, isSender: true, timestamp: "2026-11-02T18:01:00.000Z", text: "down", type: "TEXT", attachments: [], isDeleted: false, edited: true, reactions: [{ participantID: "u2", reactionKey: "❤️" }] },
    { id: "m1", senderID: "u2", senderName: "Emma Di", isSender: false, timestamp: "2026-11-02T18:00:00.000Z", text: "yosemite?", type: "TEXT", attachments: [], isDeleted: false, edited: false, reactions: [] },
    { id: "m3", senderID: "u2", senderName: "Emma Di", isSender: false, timestamp: "2026-11-02T18:02:00.000Z", text: null, type: "IMAGE", attachments: [{ type: "img" }], isDeleted: false, edited: false, reactions: [] },
    { id: "m4", senderID: "u2", senderName: "Emma Di", isSender: false, timestamp: "2026-11-02T18:03:00.000Z", text: null, type: "REACTION", attachments: [], isDeleted: false, edited: false, reactions: [] },
  ],
});

describe("beeper", () => {
  it("maps Beeper network names to platforms", () => {
    expect(["WhatsApp", "Instagram", "Facebook Messenger", "iMessage", "Signal", "Google Messages", "LinkedIn"].map(beeperPlatform)).toEqual([
      "whatsapp", "instagram", "messenger", "imessage", "signal", "sms", "other",
    ]);
  });

  it("routes each chat file to its platform's parser and reads messages in order", async () => {
    const files = { "beeper/0.json": JSON.stringify(chat("whatsapp", "WhatsApp")), "beeper/1.json": JSON.stringify(chat("signal", "Signal")) };
    const whatsapp = beeperParsers.find((p) => p.platform === "whatsapp")!;
    const run = await runParser(whatsapp, files);
    expect(run.claimed).toEqual(["beeper/0.json"]);
    expect(run.conversations.get("beeper:!room:beeper.com")).toMatchObject({ kind: "group", selfName: "Nelson", participants: ["Nelson", "Emma Di"] });
    expect(run.messages.get("beeper:!room:beeper.com")).toEqual([
      { ts: Date.parse("2026-11-02T18:00:00Z"), sender: "Emma Di", kind: "text", text: "yosemite?" },
      { ts: Date.parse("2026-11-02T18:01:00Z"), sender: "Nelson", kind: "text", text: "down", meta: { edited: true, reactions: [{ sender: "Emma Di", emoji: "❤️" }] } },
      { ts: Date.parse("2026-11-02T18:02:00Z"), sender: "Emma Di", kind: "media", text: null, meta: { media: ["photo"] } },
    ]);
  });
});
