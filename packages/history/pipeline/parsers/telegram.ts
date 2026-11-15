import { MAX_TEXT_ENTRY_BYTES, readHead, readJson } from "../archive";
import { streamJsonArray } from "../jsonStream";
import type { ArchiveEntry, MessageInput, MessageMeta, Parser, ParserIO } from "../types";

const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
const CHAT_TYPE_RE =
  /"type"\s*:\s*"(?:personal_chat|bot_chat|saved_messages|private_group|public_group|private_supergroup|public_supergroup|private_channel|public_channel)"/;
const GROUP_TYPES = new Set(["private_group", "public_group", "private_supergroup", "public_supergroup"]);
const DM_TYPES = new Set(["personal_chat", "bot_chat"]);
const MEDIA_TYPES: Record<string, string> = {
  sticker: "sticker",
  voice_message: "audio",
  audio_file: "audio",
  video_file: "video",
  video_message: "video",
  animation: "gif",
};

type TextPart = string | { type?: string; text?: string };

interface TelegramMessage {
  id?: number;
  type?: string;
  date?: string;
  date_unixtime?: string | number;
  from?: string | null;
  from_id?: string;
  actor?: string | null;
  actor_id?: string;
  text?: string | TextPart[];
  text_entities?: TextPart[];
  photo?: string;
  file?: string;
  media_type?: string;
  edited?: string;
  edited_unixtime?: string;
  action?: string;
  duration_seconds?: number;
  location_information?: unknown;
  contact_information?: unknown;
  poll?: unknown;
  reactions?: { type?: string; emoji?: string; recent?: { from?: string | null }[] }[];
}

interface TelegramChat {
  name?: string | null;
  type?: string;
  id?: number | string;
  messages?: TelegramMessage[];
}

interface ChatHead {
  name: string | null;
  type: string | undefined;
  id: string | null;
}

export const telegramParser: Parser = {
  platform: "telegram",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!/\.json$/i.test(entry.path)) continue;
      const head = (await peek(entry)).trimStart();
      if (!head.startsWith("{")) continue;
      if (/"personal_information"\s*:/.test(head) || /"about"\s*:\s*"Here is the data you requested/.test(head) || CHAT_TYPE_RE.test(head)) {
        claimed.push(entry);
      }
    }
    return claimed;
  },
  async parse(entries, io) {
    for (const entry of entries) {
      const head = await readHead(entry, 32768);
      if (/"personal_information"\s*:/.test(head) || /"about"\s*:/.test(head)) await parseFullExport(entry, head, io);
      else await parseSingleChat(entry, head, io);
    }
  },
};

async function parseFullExport(entry: ArchiveEntry, head: string, io: ParserIO) {
  const info = head.slice(Math.max(head.indexOf('"personal_information"'), 0), head.length).slice(0, 4000);
  const field = (key: string): string => {
    const raw = new RegExp('"' + key + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\\d+)').exec(info)?.[1] ?? "";
    return raw.startsWith('"') ? (JSON.parse(raw) as string).trim() : raw;
  };
  const userId = field("user_id");
  const names = [field("first_name"), field("last_name")].filter(Boolean);
  const fullName = names.join(" ");
  const hint = [...new Set([fullName, ...names, field("username")].filter(Boolean))];
  if (hint.length) io.selfHint(hint);
  const self = { id: userId ? "user" + userId : null, fallbackName: fullName };

  for (const key of ["chats", "left_chats"]) {
    let index = 0;
    for await (const raw of streamJsonArray(entry.open(), [key, "list"])) {
      index++;
      const chat = raw as TelegramChat;
      try {
        await emitChat(
          { name: chat.name ?? null, type: chat.type, id: chat.id == null ? null : String(chat.id) },
          chat.messages ?? [],
          self,
          io,
          `${entry.path} ${key}[${index}]`,
        );
      } catch (error) {
        io.warn(`${entry.path}: skipped ${key} chat #${index}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

async function parseSingleChat(entry: ArchiveEntry, head: string, io: ParserIO) {
  const self = { id: null, fallbackName: "" };
  if (entry.size <= MAX_TEXT_ENTRY_BYTES) {
    const chat = (await readJson(entry)) as TelegramChat;
    await emitChat(
      { name: chat.name ?? null, type: chat.type, id: chat.id == null ? null : String(chat.id) },
      chat.messages ?? [],
      self,
      io,
      entry.path,
    );
    return;
  }
  const rawName = /"name"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(head)?.[1];
  const chatHead: ChatHead = {
    name: rawName ? (JSON.parse(rawName) as string) : null,
    type: /"type"\s*:\s*"([a-z_]+)"/.exec(head)?.[1],
    id: /"id"\s*:\s*(-?\d+)/.exec(head)?.[1] ?? null,
  };
  await emitChat(chatHead, (streamJsonArray(entry.open(), ["messages"]) as AsyncIterable<TelegramMessage>), self, io, entry.path);
}

async function emitChat(
  head: ChatHead,
  messages: Iterable<TelegramMessage> | AsyncIterable<TelegramMessage>,
  self: { id: string | null; fallbackName: string },
  io: ParserIO,
  label: string,
) {
  if (head.type === "saved_messages") return;
  if (head.type === "private_channel" || head.type === "public_channel") {
    io.warn(`${label}: skipped channel "${head.name ?? ""}" (broadcast, not a conversation)`);
    return;
  }
  const title = head.name?.trim() ?? "";
  const externalId = head.id ?? title;
  if (!externalId) {
    io.warn(`${label}: skipped a chat with no id or name`);
    return;
  }

  const senders = new Set<string>();
  let selfName: string | null = null;
  let declared = false;
  let batch: MessageInput[] = [];
  const declare = () => {
    const kind = head.type && GROUP_TYPES.has(head.type) ? "group" : head.type && DM_TYPES.has(head.type) ? "dm" : senders.size > 2 ? "group" : "dm";
    io.conversation({
      externalId,
      title,
      kind,
      participants: [...senders],
      selfName: selfName ?? (self.id ? self.fallbackName || null : null),
    });
  };

  for await (const raw of messages) {
    const message = toMessage(raw, io);
    if (!message) continue;
    if (message.sender) senders.add(message.sender);
    const fromId = raw.type === "service" ? raw.actor_id : raw.from_id;
    if (self.id && fromId === self.id && message.sender) selfName = message.sender;
    if (!declared) {
      declare();
      declared = true;
    }
    batch.push(message);
    if (batch.length >= 1000) {
      await io.messages(externalId, batch);
      batch = [];
    }
  }
  if (!declared) {
    io.warn(`${label}: no messages in "${title}"`);
    return;
  }
  if (batch.length) await io.messages(externalId, batch);
  declare();
}

function toMessage(raw: TelegramMessage, io: ParserIO): MessageInput | null {
  const ts = timestamp(raw, io);
  if (ts === null) return null;

  if (raw.type === "service") {
    if (raw.action === "phone_call") {
      const sender = clean(raw.actor ?? raw.from ?? "");
      return {
        ts,
        sender,
        kind: "call",
        text: null,
        ...(typeof raw.duration_seconds === "number" ? { meta: { durationSec: raw.duration_seconds } } : {}),
      };
    }
    return { ts, sender: "", kind: "system", text: null };
  }
  if (raw.type !== undefined && raw.type !== "message") return null;

  const sender = clean(raw.from ?? "") || raw.from_id || "Unknown";
  const text = flatten(raw.text ?? raw.text_entities) || null;
  const media: string[] = [];
  if (raw.photo) media.push("photo");
  if (raw.media_type) media.push(MEDIA_TYPES[raw.media_type] ?? "file");
  else if (raw.file) media.push("file");
  if (raw.location_information) media.push("location");
  if (raw.contact_information) media.push("contact");
  if (raw.poll) media.push("poll");

  const meta: MessageMeta = {};
  if (media.length) meta.media = media;
  if (raw.edited || raw.edited_unixtime) meta.edited = true;
  const reactions = (raw.reactions ?? []).flatMap((reaction) =>
    reaction.type === "emoji" && reaction.emoji
      ? (reaction.recent ?? []).filter((r) => r.from).map((r) => ({ sender: clean(r.from!), emoji: reaction.emoji! }))
      : [],
  );
  if (reactions.length) meta.reactions = reactions;

  if (!text && !media.length) return null;
  return { ts, sender, kind: media.length ? "media" : "text", text, ...(Object.keys(meta).length ? { meta } : {}) };
}

function flatten(text: string | TextPart[] | undefined): string {
  if (!text) return "";
  const joined = typeof text === "string" ? text : text.map((part) => (typeof part === "string" ? part : part.text ?? "")).join("");
  return clean(joined);
}

function clean(text: string): string {
  return text.replace(INVISIBLE_RE, "").trim();
}

function timestamp(raw: TelegramMessage, io: ParserIO): number | null {
  const unix = Number(raw.date_unixtime);
  if (raw.date_unixtime !== undefined && raw.date_unixtime !== "" && Number.isFinite(unix)) return unix * 1000;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw.date ?? "");
  if (!m) return null;
  return io.fromLocal(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}
