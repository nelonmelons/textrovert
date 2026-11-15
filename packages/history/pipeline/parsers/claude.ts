import { readJson } from "../archive";
import { streamJsonArray } from "../jsonStream";
import type { ArchiveEntry, MessageInput, Parser, ParserIO } from "../types";

const SELF = "You";
const BOT = "Claude";
const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
const USERS_RE = /(^|\/)users\.json$/i;

interface Attachment {
  file_name?: string;
  file_type?: string;
}

interface ChatMessage {
  uuid?: string;
  sender?: string;
  text?: string;
  content?: { type?: string; text?: string; start_timestamp?: string }[];
  created_at?: string;
  attachments?: Attachment[];
  files?: Attachment[];
}

interface Conversation {
  uuid?: string;
  name?: string | null;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ChatMessage[];
}

export const claudeParser: Parser = {
  platform: "claude",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!/\.json$/i.test(entry.path)) continue;
      const head = (await peek(entry)).trimStart();
      if (!head.startsWith("[")) continue;
      if (USERS_RE.test(entry.path)) {
        if (/"full_name"\s*:/.test(head) && /"uuid"\s*:/.test(head)) claimed.push(entry);
        continue;
      }
      if (/"(?:mapping|current_node)"\s*:/.test(head)) continue;
      if (/"chat_messages"\s*:/.test(head) || (/"uuid"\s*:/.test(head) && /"account"\s*:/.test(head) && /"created_at"\s*:/.test(head))) {
        claimed.push(entry);
      }
    }
    return claimed;
  },
  async parse(entries, io) {
    for (const entry of entries) {
      if (USERS_RE.test(entry.path)) {
        const users = (await readJson(entry)) as { full_name?: string }[];
        const names = (Array.isArray(users) ? users : []).map((user) => user.full_name?.trim()).filter((name): name is string => !!name);
        if (names.length) io.selfHint(names);
        continue;
      }
      let index = 0;
      for await (const raw of streamJsonArray(entry.open(), [])) {
        index++;
        try {
          await parseConversation(raw as Conversation, io);
        } catch (error) {
          io.warn(`${entry.path}: skipped conversation #${index}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  },
};

async function parseConversation(conversation: Conversation, io: ParserIO) {
  if (!Array.isArray(conversation.chat_messages)) return;
  const fallbackTs = Date.parse(conversation.created_at ?? "") || 0;
  const messages: MessageInput[] = [];
  for (const message of conversation.chat_messages) {
    const converted = toMessage(message, fallbackTs);
    if (converted) messages.push(converted);
  }
  if (!messages.length) return;

  const title = conversation.name?.trim() ?? "";
  const externalId = conversation.uuid ?? `${fallbackTs}:${title}`;
  io.conversation({ externalId, title, kind: "ai", participants: [SELF, BOT], selfName: SELF });
  for (let i = 0; i < messages.length; i += 1000) await io.messages(externalId, messages.slice(i, i + 1000));
}

function toMessage(message: ChatMessage, fallbackTs: number): MessageInput | null {
  if (message.sender !== "human" && message.sender !== "assistant") return null;
  let text = message.text ?? "";
  if (!text.trim()) {
    text = (message.content ?? [])
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n\n");
  }
  text = text.replace(INVISIBLE_RE, "").trim();

  const media = [...new Set([...(message.attachments ?? []), ...(message.files ?? [])].map(attachmentKind))];
  if (!text && !media.length) return null;
  const ts = Date.parse(message.created_at ?? "") || Date.parse(message.content?.[0]?.start_timestamp ?? "") || fallbackTs;
  return {
    ts,
    sender: message.sender === "human" ? SELF : BOT,
    kind: text ? "text" : "media",
    text: text || null,
    ...(media.length ? { meta: { media } } : {}),
  };
}

function attachmentKind(attachment: Attachment): string {
  const name = `${attachment.file_type ?? ""} ${attachment.file_name ?? ""}`.toLowerCase();
  return /image\/|\.(jpe?g|png|gif|webp|heic)\b/.test(name) ? "photo" : "file";
}
