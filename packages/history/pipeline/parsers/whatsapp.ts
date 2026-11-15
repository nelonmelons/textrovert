import { readLines } from "../archive";
import type { ArchiveEntry, MessageInput, Parser, ParserIO } from "../types";

// "[1/15/24, 9:41:05 PM] Sam: hi" (iOS) and "15/01/2024, 21:41 - Sam: hi" (Android), plus dotted/ISO dates.
const HEADER_RE =
  /^\[?(\d{1,4})([./-])(\d{1,2})\2(\d{1,4}),?\s(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s?([ap])\.?\s?m\.?)?(?:\]\s?|\s[-–]\s)(.*)$/i;
const INVISIBLE_RE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const SPACES_RE = /[\u202f\u00a0]/g;
const TITLE_RE =
  /^(?:WhatsApp Chat (?:with|-|–)|Chat de WhatsApp con|WhatsApp-Chat mit|Conversa do WhatsApp com|Discussion WhatsApp avec|Chat WhatsApp con)\s*(.+?)(?:\.(?:txt|zip))?$/i;
const EDITED_RE = /\s*<This message was edited>\s*$/i;
const DELETED_RE = /^(?:This message was deleted|You deleted this message)\.?$/i;
const CALL_RE = /^(?:Missed )?(?:group )?(?:voice|video) call(?:[,.].*)?$/i;
const OMITTED_RE = /^<?(Media|image|video|audio|sticker|GIF|document|Contact card|video note) omitted>?$/i;
const ATTACHED_RE = /^<attached: (.+)>$/i;
const FILE_ATTACHED_RE = /^(.+\.\w{2,5}) \(file attached\)$/i;
// iOS attributes notices to the chat name and prefixes them with U+200E; Android writes them without a sender.
const IOS_NOTICE_RE =
  /^(?:Messages and calls are end-to-end encrypted|Messages to this (?:chat|group) are now secured|Your security code with|.+ security code changed|You blocked this contact|You unblocked this contact|Disappearing messages|.+ is a contact|.*\b(?:created group|created this group|added|removed|left|joined using this group's invite link|changed the subject|changed the group description|changed this group's|changed their phone number)\b)/i;
const GROUP_EVENT_RE =
  /\b(?:created group|created this group|added|removed|left|joined using this group's invite link|changed the subject|changed the group description|changed this group's|Messages to this group)\b/i;

type DateOrder = "dmy" | "mdy" | "ymd";

interface Pending {
  ts: number;
  sender: string;
  lines: string[];
}

export const whatsappParser: Parser = {
  platform: "whatsapp",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!/\.txt$/i.test(entry.path)) continue;
      const lines = (await peek(entry)).split(/\r?\n/).slice(0, 12);
      if (lines.some((line) => HEADER_RE.test(clean(line)))) claimed.push(entry);
    }
    return claimed;
  },
  async parse(entries, io) {
    const untitled = entries.filter((entry) => !titleFromPath(entry.path)).length;
    for (const entry of entries) {
      // The upload's own name carries the title of an iOS export ("WhatsApp Chat - Sam.zip" holding "_chat.txt"),
      // but only when it holds a single chat.
      const title = titleFromPath(entry.path) ?? (untitled === 1 ? titleFrom(io.archiveName) : null);
      await parseChat(entry, title, io);
    }
  },
};

function clean(line: string): string {
  return line.replace(INVISIBLE_RE, "").replace(SPACES_RE, " ");
}

function titleFrom(segment: string): string | null {
  return TITLE_RE.exec(segment.trim())?.[1].trim() ?? null;
}

function titleFromPath(path: string): string | null {
  for (const segment of path.split("/").reverse()) {
    const title = titleFrom(segment);
    if (title) return title;
  }
  return null;
}

async function detectDateOrder(entry: ArchiveEntry): Promise<DateOrder> {
  let sawMeridiem = false;
  for await (const raw of readLines(entry)) {
    const m = HEADER_RE.exec(clean(raw));
    if (!m) continue;
    if (m[1].length === 4) return "ymd";
    if (Number(m[1]) > 12) return "dmy";
    if (Number(m[3]) > 12) return "mdy";
    if (m[8]) sawMeridiem = true;
  }
  return sawMeridiem ? "mdy" : "dmy";
}

async function parseChat(entry: ArchiveEntry, title: string | null, io: ParserIO) {
  const order = await detectDateOrder(entry);
  const senders = new Set<string>();
  let groupEvents = false;
  let externalId: string | null = title ? "title:" + title.toLowerCase() : null;
  let declared = false;
  let pending: Pending | null = null;
  let batch: MessageInput[] = [];

  const declare = (kind: "dm" | "group") => {
    io.conversation({ externalId: externalId!, title: title ?? "", kind, participants: [...senders] });
    declared = true;
  };
  const push = async (message: MessageInput) => {
    if (!declared) declare("dm");
    batch.push(message);
    if (batch.length >= 1000) {
      await io.messages(externalId!, batch);
      batch = [];
    }
  };

  for await (const raw of readLines(entry)) {
    const line = clean(raw);
    const m = HEADER_RE.exec(line);
    if (!m) {
      pending?.lines.push(line);
      continue;
    }
    if (pending) await push(toMessage(pending));
    externalId ??= "first:" + line.slice(0, 120);
    let { sender, text } = splitSender(m[9]);
    const rawText = raw.slice(raw.indexOf(": ") + 2);
    if (sender && rawText.startsWith("\u200e") && IOS_NOTICE_RE.test(text)) sender = "";
    if (sender) senders.add(sender);
    else if (GROUP_EVENT_RE.test(text)) groupEvents = true;
    pending = { ts: timestamp(m, order, io), sender, lines: [text] };
  }
  if (pending) await push(toMessage(pending));
  if (!externalId) {
    io.warn(entry.path + ": no WhatsApp messages found");
    return;
  }
  if (batch.length) await io.messages(externalId, batch);
  declare(groupEvents || senders.size > 2 ? "group" : "dm");
}

function splitSender(rest: string): { sender: string; text: string } {
  const i = rest.indexOf(": ");
  const end = i > 0 ? i : rest.endsWith(":") ? rest.length - 1 : -1;
  const sender = end > 0 && end <= 80 ? rest.slice(0, end) : "";
  if (!sender || /["“”]/.test(sender)) return { sender: "", text: rest };
  return { sender: sender.replace(/^~\s*/, "").trim(), text: rest.slice(end + 2) };
}

function timestamp(m: RegExpExecArray, order: DateOrder, io: ParserIO): number {
  const a = Number(m[1]);
  const b = Number(m[3]);
  const c = Number(m[4]);
  let [year, month, day] = order === "ymd" ? [a, b, c] : order === "mdy" ? [c, a, b] : [c, b, a];
  if (year < 100) year += 2000;
  let hour = Number(m[5]);
  const meridiem = m[8]?.toLowerCase();
  if (meridiem === "p" && hour < 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  return io.fromLocal(year, month, day, hour, Number(m[6]), Number(m[7] ?? 0));
}

function toMessage(p: Pending): MessageInput {
  const { ts, sender } = p;
  let text = p.lines.join("\n");
  if (!sender) return { ts, sender: "", kind: "system", text };
  const edited = EDITED_RE.test(text);
  if (edited) text = text.replace(EDITED_RE, "");
  const trimmed = text.trim();
  if (DELETED_RE.test(trimmed)) return { ts, sender, kind: "deleted", text: null };
  if (CALL_RE.test(trimmed)) return { ts, sender, kind: "call", text: null };
  const omitted = OMITTED_RE.exec(trimmed);
  if (omitted) return { ts, sender, kind: "media", text: null, meta: { media: [mediaKind(omitted[1])] } };
  const [first, ...rest] = trimmed.split("\n");
  const attachment = ATTACHED_RE.exec(first.trim()) ?? FILE_ATTACHED_RE.exec(first.trim());
  const message: MessageInput = attachment
    ? { ts, sender, kind: "media", text: rest.join("\n").trim() || null, meta: { media: [mediaKind(attachment[1])] } }
    : { ts, sender, kind: "text", text: trimmed };
  if (edited) message.meta = { ...message.meta, edited: true };
  return message;
}

function mediaKind(name: string): string {
  const n = name.toLowerCase();
  if (n === "media") return "media";
  if (/sticker|\.webp$/.test(n)) return "sticker";
  if (/gif/.test(n)) return "gif";
  if (/photo|image|img|\.(jpe?g|png|heic)$/.test(n)) return "photo";
  if (/video|vid-|\.(mp4|mov|3gp)$/.test(n)) return "video";
  if (/audio|ptt|voice|\.(opus|m4a|aac|mp3|ogg)$/.test(n)) return "audio";
  if (/contact|\.vcf$/.test(n)) return "contact";
  return "file";
}
