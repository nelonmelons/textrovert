import { readLines } from "../archive";
import type { ArchiveEntry, MessageInput, MessageMeta, Parser, ParserIO } from "../types";

// imessage-exporter (github.com/ReagentX/imessage-exporter) "-f txt" output: one file per chat, no header, messages as
// "<time>[ (Read by ...)]\n<sender>\n<body lines>\n\n" and announcements as "<time> <who> <action>\n\n".
const SELF = "Me";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// chrono "%b %d, %Y %l:%M:%S %p" in the exporting Mac's zone: "May 17, 2024  5:29:42 PM", "Nov 06, 2025 12:00:00 AM".
const TIME_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}), (\d{4}) {1,2}(\d{1,2}):(\d{2}):(\d{2}) ([AP]M)(?: (.+))?$/;
const READ_RE = /^\(Read by .+ after .+\)$/;
const INDENT = "    ";
const TAPBACK_RE = /^ {4}(.+?) by (.+)$/;
const TAPBACK_EMOJI: Record<string, string> = { Loved: "\u2764\ufe0f", Liked: "\ud83d\udc4d", Disliked: "\ud83d\udc4e", Laughed: "\ud83d\ude02", Emphasized: "\u203c\ufe0f", Questioned: "\u2753" };
const EXPRESSIVE_RE = /^Sent with (?:Confetti|Echo|Fireworks|Balloons|Heart|Lasers|Shooting Star|Sparkles|Spotlight|Slam|Loud|Gentle|Invisible Ink)$/;
const EDITED_RE = /^Edited .+? later: /;
const UNSENT_PART_RE = / unsent this message part(?: .+ after sending)?!$/;
const UNSENT_RE = /^(.+) unsent a message!$/;
const GROUP_EVENT_RE = / (?:named the conversation .*|added .+ to the conversation\.|removed .+ from the conversation\.|left the conversation\.|changed the group photo\.|removed the group photo\.)$/;
const ATTACHMENT_RE = /^(?:\/|~\/|attachments\/).*\/[^/]+\.\w{2,5}$/;
const STICKER_RE = /^(?:\S+ )?Sticker from .+?: /;
// Chats with a display name are written as "<name> - <n>", where n numbers every conversation in rowid order.
const NAMED_RE = /^(.+) - \d+$/;

interface Pending {
  ts: number;
  sender: string;
  lines: string[];
  reactions: { sender: string; emoji: string }[];
  deleted: boolean;
}

export const imessageExporterParser: Parser = {
  platform: "imessage",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!/\.txt$/i.test(entry.path) || /(^|\/)orphaned\.txt$/i.test(entry.path)) continue;
      const [first = "", second = ""] = (await peek(entry)).split(/\r?\n/, 2);
      const m = TIME_RE.exec(first);
      if (m && (isHeader(m) ? second.trim() !== "" : second === "")) claimed.push(entry);
    }
    return claimed;
  },
  async parse(entries, io) {
    const names = entries.map((entry) => (entry.path.split("/").pop() ?? entry.path).replace(/\.txt$/i, ""));
    const groups = names.map((name) => NAMED_RE.exec(name)?.[1]);
    for (const [i, entry] of entries.entries()) {
      const group = groups[i];
      // The number after a group's name shifts whenever an older chat is deleted, so the name alone is the key,
      // unless two groups in this export share it.
      const externalId =
        group === undefined
          ? "chat:" + names[i].split(", ").sort().join(", ")
          : "group:" + (groups.filter((g) => g === group).length > 1 ? names[i] : group);
      await parseChat(entry, names[i], group, externalId, io);
    }
  },
};

function isHeader(m: RegExpExecArray): boolean {
  return m[8] === undefined || READ_RE.test(m[8]);
}

function timestamp(m: RegExpExecArray, io: ParserIO): number {
  const hour = (Number(m[4]) % 12) + (m[7] === "PM" ? 12 : 0);
  return io.fromLocal(Number(m[3]), MONTHS.indexOf(m[1]) + 1, Number(m[2]), hour, Number(m[5]), Number(m[6]));
}

async function parseChat(entry: ArchiveEntry, name: string, group: string | undefined, externalId: string, io: ParserIO) {
  const senders = new Set<string>();
  let groupEvents = false;
  let declared = false;
  let batch: MessageInput[] = [];
  let pending: Pending | null = null;
  let mode: "sender" | "body" | "tapbacks" | "reply" = "body";
  let previous = "";

  const declare = (final: boolean) => {
    const others = [...senders].filter((s) => s !== SELF);
    const kind = group !== undefined || name.includes(", ") || others.length > 1 || groupEvents ? "group" : "dm";
    // Unnamed chats are titled from their senders later; the file name (handles) only helps when nobody else spoke.
    const title = group ?? (final && others.length === 0 ? name : "");
    io.conversation({ externalId, title, kind, participants: [...senders], selfName: SELF });
    declared = true;
  };
  const push = async (message: MessageInput | null) => {
    if (!message) return;
    if (message.sender) senders.add(message.sender);
    for (const reaction of message.meta?.reactions ?? []) senders.add(reaction.sender);
    if (!declared) declare(false);
    batch.push(message);
    if (batch.length >= 1000) {
      await io.messages(externalId, batch);
      batch = [];
    }
  };

  const handle = async (line: string, next: string | undefined) => {
    const atBoundary = previous.trim() === "";
    previous = line;
    const m = TIME_RE.exec(line);
    if (m && isHeader(m) && next?.trim()) {
      if (pending) await push(toMessage(pending));
      pending = { ts: timestamp(m, io), sender: "", lines: [], reactions: [], deleted: false };
      mode = "sender";
      return;
    }
    // Edit histories also start with "<time> <text>", but inside a message rather than between blank lines.
    if (m && atBoundary && !next?.trim()) {
      if (pending) await push(toMessage(pending));
      pending = null;
      if (GROUP_EVENT_RE.test(m[8])) groupEvents = true;
      await push(announcement(timestamp(m, io), m[8]));
      return;
    }
    if (!pending || line === "Unable to format announcement!") return;
    if (mode === "sender") {
      pending.sender = line;
      mode = "body";
      return;
    }
    if (mode === "tapbacks") {
      if (line.startsWith(INDENT)) {
        const t = TAPBACK_RE.exec(line);
        if (t) pending.reactions.push({ sender: t[2], emoji: TAPBACK_EMOJI[t[1]] ?? t[1] });
        return;
      }
      mode = "body";
      if (!line.trim()) return;
    }
    // Threaded replies are printed indented under the message they answer and again at top level; keep the latter.
    if (mode === "reply") {
      if (!line.trim() || line.startsWith(INDENT)) return;
      mode = "body";
    }
    if (line === "Tapbacks:") mode = "tapbacks";
    else if (line.startsWith(INDENT) && TIME_RE.test(line.slice(INDENT.length))) mode = "reply";
    else if (line === "This message was deleted from the conversation!") pending.deleted = true;
    else if (line !== "This message responded to an earlier message.") pending.lines.push(line);
  };

  let held: string | undefined;
  for await (const line of readLines(entry)) {
    if (held !== undefined) await handle(held, line);
    held = line;
  }
  if (held !== undefined) await handle(held, undefined);
  if (pending) await push(toMessage(pending));
  if (!declared) {
    io.warn(entry.path + ": no iMessage messages found");
    return;
  }
  if (batch.length) await io.messages(externalId, batch);
  declare(true);
}

function announcement(ts: number, text: string): MessageInput {
  const unsent = UNSENT_RE.exec(text);
  if (unsent) return { ts, sender: unsent[1] === "You" ? SELF : unsent[1], kind: "deleted", text: null };
  return { ts, sender: "", kind: "system", text };
}

function toMessage(p: Pending): MessageInput | null {
  const { ts, sender } = p;
  if (p.deleted) return { ts, sender, kind: "deleted", text: null };
  let lines = p.lines.filter((line) => !EXPRESSIVE_RE.test(line) && !UNSENT_PART_RE.test(line));
  const unsent = lines.length < p.lines.length && p.lines.some((line) => UNSENT_PART_RE.test(line));
  const translated = lines.indexOf("Translated from:");
  if (translated >= 0) lines = lines.slice(translated + 1);

  // An edit history is "<original time> <text>" followed by "Edited <n> later: <text>" rows; keep the final text.
  let edited = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!EDITED_RE.test(lines[i])) continue;
    lines = [lines[i].replace(EDITED_RE, ""), ...lines.slice(i + 1)];
    edited = true;
    break;
  }
  const original = TIME_RE.exec(lines[0] ?? "");
  if (!edited && original?.[8] && !isHeader(original)) {
    lines = [original[8], ...lines.slice(1)];
    edited = true;
  }

  const media: string[] = [];
  const text: string[] = [];
  for (const line of lines) {
    if (line === "Attachment missing!") media.push("file");
    else if (STICKER_RE.test(line)) media.push("sticker");
    else if (ATTACHMENT_RE.test(line)) media.push(mediaKind(line));
    else text.push(line);
  }
  const body = text.join("\n").trim();
  if (!body && !media.length) return unsent ? { ts, sender, kind: "deleted", text: null } : null;

  const meta: MessageMeta = {};
  if (media.length) meta.media = [...new Set(media)];
  if (edited) meta.edited = true;
  if (p.reactions.length) meta.reactions = p.reactions;
  return { ts, sender, kind: media.length ? "media" : "text", text: body || null, ...(Object.keys(meta).length ? { meta } : {}) };
}

function mediaKind(path: string): string {
  const file = path.toLowerCase();
  if (file.endsWith(".gif")) return "gif";
  if (/\.(jpe?g|png|heic|heif|webp|tiff?)$/.test(file)) return "photo";
  if (/\.(mov|mp4|m4v)$/.test(file)) return "video";
  if (/\.(caf|m4a|mp3|amr|aac|wav)$/.test(file)) return "audio";
  if (file.endsWith(".loc.vcf")) return "location";
  if (file.endsWith(".vcf")) return "contact";
  return "file";
}
