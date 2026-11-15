import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { chatgptParser } from "../chatgpt";
import { claudeParser } from "../claude";
import { csvParser } from "../csv";
import { telegramParser } from "../telegram";

const msg = (role: string, parts: unknown[], time: number | null, extra: Record<string, unknown> = {}, content: Record<string, unknown> = {}) => ({
  id: "m",
  author: { role },
  create_time: time,
  content: { content_type: "text", parts, ...content },
  metadata: {},
  recipient: "all",
  ...extra,
});

const node = (id: string, parent: string | null, children: string[], message: unknown) => [id, { id, message, parent, children }] as const;

function conversation(overrides: Record<string, unknown> = {}) {
  const nodes = [
    node("root", null, ["sys"], null),
    node("sys", "root", ["u1"], msg("system", [""], null, { metadata: { is_visually_hidden_from_conversation: true } })),
    node("u1", "sys", ["a1", "a1b"], msg("user", ["What is a monad?"], 1_700_000_000.5)),
    node("a1", "u1", [], msg("assistant", ["Discarded regeneration"], 1_700_000_001, { metadata: { model_slug: "gpt-4o" } })),
    node("a1b", "u1", ["think"], msg("assistant", ["A monad is a monoid in the category of endofunctors.\ue200cite\ue202turn0search0\ue201"], 1_700_000_002, { metadata: { model_slug: "gpt-4o" } })),
    node("think", "a1b", ["u2"], msg("assistant", ["secret reasoning"], 1_700_000_003, {}, { content_type: "thoughts" })),
    node("u2", "think", ["call"], msg("user", [{ content_type: "image_asset_pointer", asset_pointer: "file-service://x" }, "what is in this picture?"], 1_700_000_100, {}, { content_type: "multimodal_text" })),
    node("call", "u2", ["tool"], msg("assistant", ["{\"code\": 1}"], 1_700_000_101, { recipient: "python" })),
    node("tool", "call", ["a2"], msg("tool", ["output"], 1_700_000_102)),
    node("a2", "tool", ["u3"], msg("assistant", ["A cat."], null, { metadata: {} })),
    node("u3", "a2", [], msg("user", [{ content_type: "image_asset_pointer" }], 1_700_000_200, {}, { content_type: "multimodal_text" })),
  ];
  return {
    id: "conv-1",
    title: "Monads",
    create_time: 1_700_000_000,
    mapping: Object.fromEntries(nodes),
    current_node: "u3",
    default_model_slug: "gpt-4o-mini",
    ...overrides,
  };
}

describe("chatgpt", () => {
  it("follows the visible branch and skips tool, hidden and reasoning nodes", async () => {
    const run = await runParser(chatgptParser, { "export/conversations.json": JSON.stringify([conversation()]) });

    expect(run.claimed).toEqual(["export/conversations.json"]);
    expect(run.conversations.get("conv-1")).toEqual({ externalId: "conv-1", title: "Monads", kind: "ai", participants: ["You", "ChatGPT"], selfName: "You" });
    const messages = run.messages.get("conv-1")!;
    expect(messages.map((m) => [m.sender, m.kind])).toEqual([
      ["You", "text"],
      ["ChatGPT", "text"],
      ["You", "text"],
      ["ChatGPT", "text"],
      ["You", "media"],
    ]);
    expect(messages[0]).toMatchObject({ text: "What is a monad?", ts: 1_700_000_000_500 });
    expect(messages[1]).toMatchObject({ text: "A monad is a monoid in the category of endofunctors.", meta: { model: "gpt-4o" } });
    expect(messages[2]).toMatchObject({ text: "what is in this picture?", meta: { media: ["photo"] } });
    expect(messages[3]).toMatchObject({ text: "A cat.", ts: 1_700_000_000_000, meta: { model: "gpt-4o-mini" } });
    expect(messages[4]).toMatchObject({ text: null, meta: { media: ["photo"] } });
  });

  it("falls back to the newest leaf when current_node is missing", async () => {
    const run = await runParser(chatgptParser, {
      "conversations.json": JSON.stringify([conversation({ current_node: null, id: undefined, conversation_id: "c2" })]),
    });
    expect(run.messages.get("c2")!.length).toBe(5);
  });

  it("merges numbered shards of one export and survives a malformed conversation", async () => {
    const shard0 = JSON.stringify([conversation(), { id: "bad", mapping: "nope" }]);
    const shard1 = JSON.stringify([conversation({ id: "conv-2", title: "Second" })]);
    const run = await runParser(chatgptParser, { "conversations-000.json": shard0, "conversations-001.json": shard1 });
    expect(run.claimed).toEqual(["conversations-000.json", "conversations-001.json"]);
    expect([...run.conversations.keys()]).toEqual(["conv-1", "conv-2"]);
  });

  it("claims by content, not by file name, and ignores look-alikes", async () => {
    const claude = JSON.stringify([{ uuid: "u", name: "x", created_at: "2024-01-01T00:00:00Z", account: { uuid: "a" }, chat_messages: [] }]);
    const telegram = JSON.stringify({ name: "Sam", type: "personal_chat", id: 1, messages: [] });
    const run = await runParser(chatgptParser, {
      "claude/conversations.json": claude,
      "telegram/result.json": telegram,
      "shared_conversations.json": JSON.stringify([{ id: "x", conversation_id: "y", title: "t", is_anonymous: true }]),
      "message_feedback.json": "[]",
      "renamed/chats.json": JSON.stringify([conversation()]),
      "notes.txt": '[{"mapping": {}}]',
    });
    expect(run.claimed).toEqual(["renamed/chats.json"]);
    expect((await runParser(claudeParser, { "conversations.json": JSON.stringify([conversation()]) })).claimed).toEqual([]);
    expect((await runParser(csvParser, { "conversations.json": "[]" })).claimed).toEqual([]);
    expect((await runParser(telegramParser, { "conversations.json": JSON.stringify([conversation()]) })).claimed).toEqual([]);
  });
});
