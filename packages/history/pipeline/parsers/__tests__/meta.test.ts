import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { instagramParser, messengerParser } from "../meta";

// Meta writes every UTF-8 byte as its own \u00XX code point.
const moji = (s: string) => Buffer.from(s, "utf8").toString("latin1");
const json = (value: unknown) => JSON.stringify(value);

const T = Date.UTC(2024, 0, 15, 21, 41, 5);

const dmThread = {
  participants: [{ name: moji("Sam Léo") }, { name: "Kevin" }],
  messages: [
    {
      sender_name: "Kevin",
      timestamp_ms: T + 5000,
      photos: [{ uri: "your_instagram_activity/messages/inbox/samleo_123/photos/1.jpg", creation_timestamp: 1 }],
    },
    { sender_name: moji("Sam Léo"), timestamp_ms: T + 4000, content: "Reacted " + moji("😂") + " to your message" },
    { sender_name: moji("Sam Léo"), timestamp_ms: T + 3000, content: "Sam Léo sent an attachment." },
    { sender_name: "Kevin", timestamp_ms: T + 2000, content: moji("haha 😂 café"), reactions: [{ reaction: moji("❤️"), actor: moji("Sam Léo") }] },
    { sender_name: moji("Sam Léo"), timestamp_ms: T + 1000, call_duration: 62 },
    { sender_name: moji("Sam Léo"), timestamp_ms: T, content: "hey" },
  ],
  title: moji("Sam Léo"),
  is_still_participant: true,
  thread_path: "inbox/samleo_123",
};

describe("instagram", () => {
  it("parses a modern export, fixes mojibake and orders messages oldest first", async () => {
    const files = {
      "instagram-kz-2024/your_instagram_activity/messages/inbox/samleo_123/message_1.json": json(dmThread),
      "instagram-kz-2024/your_instagram_activity/messages/inbox/samleo_123/message_2.json": json({
        participants: dmThread.participants,
        messages: [{ sender_name: "Kevin", timestamp_ms: T - 60_000, content: "first ever" }],
        title: dmThread.title,
        thread_path: "inbox/samleo_123",
      }),
      "instagram-kz-2024/your_instagram_activity/messages/inbox/samleo_123/photos/1.jpg": "x",
      "instagram-kz-2024/personal_information/personal_information/personal_information.json": json({
        profile_user: [{ string_map_data: { Name: { value: "Kevin Z" }, Username: { value: "kz" } } }],
      }),
    };
    const run = await runParser(instagramParser, files);

    expect(run.claimed).toEqual([
      "instagram-kz-2024/your_instagram_activity/messages/inbox/samleo_123/message_1.json",
      "instagram-kz-2024/your_instagram_activity/messages/inbox/samleo_123/message_2.json",
      "instagram-kz-2024/personal_information/personal_information/personal_information.json",
    ]);
    expect(run.selfHints).toEqual(["Kevin Z", "kz"]);
    expect(run.conversations.size).toBe(1);
    expect(run.conversations.get("samleo_123")).toMatchObject({
      title: "Sam Léo",
      kind: "dm",
      participants: ["Sam Léo", "Kevin"],
    });
    const messages = run.messages.get("samleo_123")!;
    expect(messages.map((m) => m.ts)).toEqual([T - 60_000, T, T + 1000, T + 2000, T + 3000, T + 4000, T + 5000]);
    expect(messages.map((m) => m.kind)).toEqual(["text", "text", "call", "text", "media", "system", "media"]);
    expect(messages[3]).toMatchObject({
      sender: "Kevin",
      text: "haha 😂 café",
      meta: { reactions: [{ sender: "Sam Léo", emoji: "❤️" }] },
    });
    expect(messages[2]).toMatchObject({ sender: "Sam Léo", text: null, meta: { durationSec: 62 } });
    expect(messages[4]).toEqual({ ts: T + 3000, sender: "Sam Léo", kind: "media", text: null, meta: { media: ["file"] } });
    expect(messages[5]).toMatchObject({ sender: "", text: "Reacted 😂 to your message" });
    expect(messages[6].meta).toEqual({ media: ["photo"] });
  });

  it("treats threads with more than two participants as groups and handles shares, unsent messages and sent-attachment lines", async () => {
    const thread = {
      participants: [{ name: "A" }, { name: "B" }, { name: "C" }],
      messages: [
        { sender_name: "C", timestamp_ms: T + 5, is_unsent: true },
        { sender_name: "B", timestamp_ms: T + 4, share: { link: "https://instagram.com/reel/x", share_text: "caption" }, content: "B sent an attachment." },
        { sender_name: "A", timestamp_ms: T + 3, videos: [{ uri: "v.mp4" }, { uri: "w.mp4" }], content: "two vids" },
        { sender_name: "A", timestamp_ms: T + 2, audio_files: [{ uri: "a.mp4" }] },
        { sender_name: "B", timestamp_ms: T + 1, sticker: { uri: "s.png" } },
        { sender_name: "C", timestamp_ms: T, content: "Liked a message" },
      ],
      title: "the trio",
      thread_path: "inbox/thetrio_9",
    };
    const run = await runParser(instagramParser, { "messages/inbox/thetrio_9/message_1.json": json(thread) });
    const conversation = run.conversations.get("thetrio_9")!;
    expect(conversation).toMatchObject({ title: "the trio", kind: "group", participants: ["A", "B", "C"] });
    const messages = run.messages.get("thetrio_9")!;
    expect(messages.map((m) => m.kind)).toEqual(["system", "media", "media", "media", "media", "deleted"]);
    expect(messages[1].meta).toEqual({ media: ["sticker"] });
    expect(messages[2].meta).toEqual({ media: ["audio"] });
    expect(messages[3]).toMatchObject({ text: "two vids", meta: { media: ["video", "video"] } });
    expect(messages[4]).toMatchObject({ text: "https://instagram.com/reel/x", meta: { media: ["share"] } });
  });

  it("does not turn typed text that looks like an activity line into a notice", async () => {
    const thread = {
      participants: [{ name: "A" }, { name: "B" }],
      messages: [
        { sender_name: "A", timestamp_ms: T + 1, content: "sent a photo of my cat lol" },
        { sender_name: "A", timestamp_ms: T, content: "I started a video call with her" },
      ],
      title: "B",
    };
    const run = await runParser(instagramParser, { "your_instagram_activity/messages/inbox/b_1/message_1.json": json(thread) });
    expect(run.messages.get("b_1")!.map((m) => m.kind)).toEqual(["text", "text"]);
  });

  it("claims root-level messages/ only when the siblings say Instagram", async () => {
    const files = {
      "messages/inbox/sam_1/message_1.json": json(dmThread),
      "messages/message_requests/rando_2/message_1.json": json({ ...dmThread, title: "Rando" }),
      "story_sticker_interactions/story_likes.json": "{}",
      "account_history/login_activity.json": "{}",
    };
    const instagram = await runParser(instagramParser, files);
    const messenger = await runParser(messengerParser, files);
    expect(instagram.claimed).toEqual(["messages/inbox/sam_1/message_1.json", "messages/message_requests/rando_2/message_1.json"]);
    expect(messenger.claimed).toEqual([]);
    expect([...instagram.conversations.keys()]).toEqual(["sam_1", "rando_2"]);
  });

  it("warns about a broken thread file and keeps going", async () => {
    const run = await runParser(instagramParser, {
      "your_instagram_activity/messages/inbox/bad_1/message_1.json": "{ not json",
      "your_instagram_activity/messages/inbox/good_2/message_1.json": json(dmThread),
    });
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain("bad_1");
    expect(run.conversations.has("good_2")).toBe(true);
  });

  it("splits conversations of more than 1000 messages into batches", async () => {
    const messages = Array.from({ length: 2500 }, (_, i) => ({ sender_name: "A", timestamp_ms: T + i, content: "m" + i }));
    const run = await runParser(instagramParser, {
      "your_instagram_activity/messages/inbox/big_1/message_1.json": json({ participants: [{ name: "A" }, { name: "B" }], messages, title: "B" }),
    });
    expect(run.messages.get("big_1")).toHaveLength(2500);
  });

  it("ignores Instagram claim-lookalikes from other platforms", async () => {
    const run = await runParser(instagramParser, {
      "messages/c123/messages.json": "[]",
      "messages/index.json": "{}",
      "result.json": "{}",
      "json/chat_history.json": "{}",
      "personal_information/personal_information.json": json({ name: "not instagram" }),
    });
    expect(run.claimed).toEqual([]);
  });
});

describe("messenger", () => {
  const fbThread = {
    participants: [{ name: "Kevin Z" }, { name: moji("Zoë") }],
    messages: [
      { sender_name: "Kevin Z", timestamp_ms: T + 3, type: "Call", call_duration: 0, content: "Kevin Z missed a call." },
      { sender_name: moji("Zoë"), timestamp_ms: T + 2, type: "Generic", content: "You unsent a message." },
      { sender_name: "Kevin Z", timestamp_ms: T + 1, type: "Generic", content: "hello " + moji("👋"), photos: [{ uri: "a.jpg" }] },
      { sender_name: "Kevin Z", timestamp_ms: T, type: "Generic", content: "Kevin Z named the group Brunch." },
    ],
    title: moji("Zoë"),
    is_still_participant: true,
    thread_type: "Regular",
    thread_path: "inbox/zoe_abc",
  };

  it("claims your_facebook_activity threads and the profile file, and not Instagram ones", async () => {
    const files = {
      "facebook-kz/your_facebook_activity/messages/inbox/zoe_abc/message_1.json": json(fbThread),
      "facebook-kz/your_facebook_activity/messages/e2ee_cutover/old_7/message_1.json": json({ ...fbThread, title: "Old" }),
      "facebook-kz/personal_information/profile_information/profile_information.json": json({
        profile_v2: { name: { full_name: "Kevin Z", first_name: "Kevin", last_name: "Z" } },
      }),
      "instagram-kz/your_instagram_activity/messages/inbox/sam_1/message_1.json": json(dmThread),
    };
    const run = await runParser(messengerParser, files);
    expect(run.claimed).toEqual([
      "facebook-kz/your_facebook_activity/messages/inbox/zoe_abc/message_1.json",
      "facebook-kz/your_facebook_activity/messages/e2ee_cutover/old_7/message_1.json",
      "facebook-kz/personal_information/profile_information/profile_information.json",
    ]);
    expect(run.selfHints).toEqual(["Kevin Z"]);
    const messages = run.messages.get("zoe_abc")!;
    expect(run.conversations.get("zoe_abc")).toMatchObject({ title: "Zoë", kind: "dm", participants: ["Kevin Z", "Zoë"] });
    expect(messages.map((m) => m.kind)).toEqual(["system", "media", "deleted", "call"]);
    expect(messages[1]).toMatchObject({ text: "hello 👋", meta: { media: ["photo"] } });
    expect(messages[3]).toMatchObject({ sender: "Kevin Z", text: null });
    expect(messages[3].meta).toBeUndefined();
  });

  it("reads Facebook's old root layout and treats Subscribe events and thread_type RegularGroup", async () => {
    const group = {
      participants: [{ name: "A" }, { name: "B" }],
      messages: [
        { sender_name: "A", timestamp_ms: T + 1, type: "Subscribe", content: "A added B to the group." },
        { sender_name: "B", timestamp_ms: T, type: "Generic", content: "hi" },
      ],
      title: "Two of us",
      thread_type: "RegularGroup",
    };
    const files = {
      "messages/archived_threads/two_1/message_1.json": json(group),
      "profile_information/profile_information.json": json({ profile_v2: { name: { full_name: "A" } } }),
      "posts/your_posts_1.json": "[]",
    };
    const messenger = await runParser(messengerParser, files);
    const instagram = await runParser(instagramParser, files);
    expect(instagram.claimed).toEqual([]);
    expect(messenger.conversations.get("two_1")).toMatchObject({ kind: "group" });
    expect(messenger.messages.get("two_1")!.map((m) => [m.kind, m.sender])).toEqual([
      ["text", "B"],
      ["system", ""],
    ]);
  });

  it("uses a Messenger-looking message to place an unlabeled root-level export", async () => {
    const files = { "messages/inbox/zoe_abc/message_1.json": json(fbThread) };
    expect((await runParser(messengerParser, files)).claimed).toHaveLength(1);
    expect((await runParser(instagramParser, files)).claimed).toHaveLength(0);
  });

  it("parses end-to-end encrypted chat exports", async () => {
    const e2ee = {
      participants: ["Kevin Z", "Zoë"],
      threadName: "Zoë",
      messages: [
        { isUnsent: false, media: [], reactions: [{ actor: "Kevin Z", reaction: "👍" }], senderName: "Zoë", text: "hi", timestamp: T, type: "text" },
        { isUnsent: false, media: [{ uri: "files/a.jpg" }], reactions: [], senderName: "Kevin Z", text: "", timestamp: T + 1, type: "media" },
        { isUnsent: true, media: [], reactions: [], senderName: "Zoë", text: "", timestamp: T + 2, type: "text" },
      ],
    };
    const run = await runParser(messengerParser, { "e2ee/zoe.json": json(e2ee), "notes/other.json": json({ messages: [] }) });
    expect(run.claimed).toEqual(["e2ee/zoe.json"]);
    expect(run.conversations.get("e2ee:zoe")).toMatchObject({ title: "Zoë", kind: "dm", participants: ["Kevin Z", "Zoë"] });
    const messages = run.messages.get("e2ee:zoe")!;
    expect(messages.map((m) => m.kind)).toEqual(["text", "media", "deleted"]);
    expect(messages[0].meta).toEqual({ reactions: [{ sender: "Kevin Z", emoji: "👍" }] });
    expect(messages[1].meta).toEqual({ media: ["photo"] });
  });
});
