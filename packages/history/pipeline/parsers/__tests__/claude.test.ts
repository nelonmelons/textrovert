import { describe, expect, it } from "vitest";

import { runParser } from "../../testing";
import { chatgptParser } from "../chatgpt";
import { claudeParser } from "../claude";

const conversations = [
  {
    uuid: "11111111-aaaa",
    name: "Refactor plan",
    summary: "",
    created_at: "2025-03-01T10:00:00.000000Z",
    updated_at: "2025-03-01T10:05:00.000000Z",
    account: { uuid: "acct" },
    chat_messages: [
      {
        uuid: "m1",
        text: "Can you review this?",
        content: [{ type: "text", text: "Can you review this?" }],
        sender: "human",
        created_at: "2025-03-01T10:00:01.000000Z",
        attachments: [{ file_name: "notes.txt", file_size: 12, file_type: "txt", extracted_content: "hi" }],
        files: [{ file_name: "shot.png" }],
      },
      {
        uuid: "m2",
        text: "",
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "Looks good." },
          { type: "tool_use", name: "x" },
          { type: "text", text: "Ship it." },
        ],
        sender: "assistant",
        created_at: "2025-03-01T10:00:09.500000Z",
        attachments: [],
        files: [],
      },
      { uuid: "m3", text: "", content: [], sender: "human", created_at: "2025-03-01T10:01:00Z", attachments: [], files: [] },
      { uuid: "m4", text: "tool noise", sender: "tool", created_at: "2025-03-01T10:02:00Z" },
      { uuid: "m5", text: "no timestamp", sender: "human", attachments: [], files: [] },
    ],
  },
  { uuid: "22222222-bbbb", name: "", created_at: "2025-03-02T00:00:00Z", account: { uuid: "acct" }, chat_messages: [] },
];

describe("claude", () => {
  it("parses conversations and the user's name", async () => {
    const run = await runParser(claudeParser, {
      "claude-export/conversations.json": JSON.stringify(conversations),
      "claude-export/users.json": JSON.stringify([{ uuid: "u", full_name: "Kevin Zou", email_address: "k@example.com", verified_phone_number: null }]),
      "claude-export/projects.json": JSON.stringify([{ uuid: "p", name: "Proj", description: "d", docs: [] }]),
    });

    expect(run.claimed).toEqual(["claude-export/conversations.json", "claude-export/users.json"]);
    expect(run.selfHints).toEqual(["Kevin Zou"]);
    expect([...run.conversations.keys()]).toEqual(["11111111-aaaa"]);
    expect(run.conversations.get("11111111-aaaa")).toEqual({
      externalId: "11111111-aaaa",
      title: "Refactor plan",
      kind: "ai",
      participants: ["You", "Claude"],
      selfName: "You",
    });
    const messages = run.messages.get("11111111-aaaa")!;
    expect(messages).toEqual([
      { ts: Date.UTC(2025, 2, 1, 10, 0, 1), sender: "You", kind: "text", text: "Can you review this?", meta: { media: ["file", "photo"] } },
      { ts: Date.UTC(2025, 2, 1, 10, 0, 9, 500), sender: "Claude", kind: "text", text: "Looks good.\n\nShip it." },
      { ts: Date.UTC(2025, 2, 1, 10, 0, 0), sender: "You", kind: "text", text: "no timestamp" },
    ]);
  });

  it("tells Claude exports apart from ChatGPT's by shape, whatever the file is called", async () => {
    const chatgpt = JSON.stringify([{ id: "c", title: "t", create_time: 1, mapping: {}, current_node: null }]);
    const files = { "a/conversations.json": chatgpt, "b/conversations.json": JSON.stringify(conversations), "c/users.json": "[]", "d/people.json": '[{"uuid":"x","full_name":"N"}]' };
    expect((await runParser(claudeParser, files)).claimed).toEqual(["b/conversations.json"]);
    expect((await runParser(chatgptParser, files)).claimed).toEqual(["a/conversations.json"]);
  });
});
