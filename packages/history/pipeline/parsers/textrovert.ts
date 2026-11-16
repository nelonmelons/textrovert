import { readHead } from "../archive";
import { streamJsonArray } from "../jsonStream";
import type { ArchiveEntry, MessageInput, MessageKind, MessageMeta, Parser, ParserIO } from "../types";

// The Textrovert Mac app's "Save for iPhone" file (mac/Sources/TextrovertCore/MessagesFile.swift):
// {"format":"textrovert-messages","version":1,"exportedAt":<s>,"chats":[{"id","title","group","people","messages":[...]}]}
// with each message {"t": seconds since 1970, "from"?: sender (absent for yours and for system notices), "text"?,
// "kind"?: absent for text, otherwise photo|video|gif|audio|sticker|location|contact|file|deleted|system,
// "reactions"?: [[sender, emoji]] with "Me" for yours}. The Mac app builds it from imessage-exporter "-f txt" output the
// same way imessageExporter.ts reads that output, so chat ids, titles and senders match and both paths merge.
const SELF = "Me";
const FORMAT_RE = /"format"\s*:\s*"textrovert-messages"/;
// Fallback when an encoder wrote other keys first: a "chats" array whose first message carries a numeric "t".
const SHAPE_RE = /"chats"\s*:\s*\[\s*\{[\s\S]*?"messages"\s*:\s*\[\s*\{[^{}]*"t"\s*:\s*-?\d/;
const VERSION_RE = /"version"\s*:\s*(\d+)/;
const MEDIA_KINDS = new Set(["photo", "video", "gif", "audio", "sticker", "location", "contact", "file"]);
const BATCH = 1000;

interface FileChat {
  id?: unknown;
  title?: unknown;
  group?: unknown;
  people?: unknown;
  messages?: unknown;
}

interface FileMessage {
  t?: unknown;
  from?: unknown;
  text?: unknown;
  kind?: unknown;
  reactions?: unknown;
}

export const textrovertParser: Parser = {
  platform: "imessage",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (/\.textrovert$/i.test(entry.path)) {
        claimed.push(entry);
        continue;
      }
      // Renamed or zipped copies: only .json or extension-less files, and only with this format's marker or shape.
      const base = entry.path.split("/").pop() ?? entry.path;
      if (!/\.json$/i.test(base) && /\.[A-Za-z0-9]{1,10}$/.test(base)) continue;
      const head = (await peek(entry)).trimStart();
      if (head.startsWith("{") && (FORMAT_RE.test(head) || SHAPE_RE.test(head))) claimed.push(entry);
    }
    return claimed;
  },
  async parse(entries, io) {
    for (const entry of entries) await parseFile(entry, io);
  },
};

async function parseFile(entry: ArchiveEntry, io: ParserIO) {
  const head = await readHead(entry, 4096);
  const version = Number(VERSION_RE.exec(head)?.[1] ?? 1);
  if (version > 1) io.warn(`${entry.path}: Textrovert messages file version ${version} is newer than this backend; reading what it can`);
  let chats = 0;
  try {
    for await (const raw of streamJsonArray(entry.open(), ["chats"])) {
      if (await parseChat(raw, io)) chats++;
    }
  } catch (error) {
    io.warn(`${entry.path}: not a readable Textrovert messages file (${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  if (chats === 0) io.warn(entry.path + ": no chats found in this Textrovert messages file");
}

async function parseChat(raw: unknown, io: ParserIO): Promise<boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const chat = raw as FileChat;
  if (!Array.isArray(chat.messages)) return false;
  const title = typeof chat.title === "string" ? chat.title : "";
  const group = chat.group === true;
  const externalId = typeof chat.id === "string" && chat.id ? chat.id : (group ? "group:" : "chat:") + title;

  // Senders in order of appearance, reaction senders included, exactly as imessageExporter.ts collects them.
  const senders = new Set<string>();
  const messages: MessageInput[] = [];
  for (const item of chat.messages) {
    const message = toMessage(item as FileMessage);
    if (!message) continue;
    if (message.sender) senders.add(message.sender);
    for (const reaction of message.meta?.reactions ?? []) senders.add(reaction.sender);
    messages.push(message);
  }
  if (messages.length === 0) return false;
  if (Array.isArray(chat.people)) for (const person of chat.people) if (typeof person === "string" && person) senders.add(person);

  const others = [...senders].filter((s) => s !== SELF);
  // Named groups keep their name; other chats are titled from their senders later, unless nobody else spoke.
  const keepTitle = externalId.startsWith("group:") || others.length === 0;
  io.conversation({
    externalId,
    title: keepTitle ? title : "",
    kind: group || others.length > 1 ? "group" : "dm",
    participants: [...senders],
    selfName: SELF,
  });
  for (let i = 0; i < messages.length; i += BATCH) await io.messages(externalId, messages.slice(i, i + BATCH));
  return true;
}

function toMessage(m: FileMessage | null | undefined): MessageInput | null {
  if (!m || typeof m !== "object" || typeof m.t !== "number" || !Number.isFinite(m.t)) return null;
  const ts = Math.round(m.t * 1000);
  const kind = typeof m.kind === "string" && m.kind ? m.kind : null;
  const text = typeof m.text === "string" && m.text !== "" ? m.text : null;
  if (kind === "system") return text === null ? null : { ts, sender: "", kind: "system", text };
  const sender = typeof m.from === "string" && m.from ? m.from : SELF;
  if (kind === "deleted") return { ts, sender, kind: "deleted", text: null };

  const reactions = Array.isArray(m.reactions)
    ? m.reactions.flatMap((r) =>
        Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "string" && r[0] ? [{ sender: r[0], emoji: r[1] }] : [],
      )
    : [];
  const meta: MessageMeta = {};
  let outKind: MessageKind = "text";
  if (kind) {
    outKind = "media";
    meta.media = [MEDIA_KINDS.has(kind) ? kind : "file"];
  } else if (text === null) {
    return null;
  }
  if (reactions.length) meta.reactions = reactions;
  return { ts, sender, kind: outKind, text, ...(Object.keys(meta).length ? { meta } : {}) };
}
