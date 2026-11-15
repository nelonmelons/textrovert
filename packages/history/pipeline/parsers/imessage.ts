import { materialize } from "../archive";
import type { ArchiveEntry, MessageInput, MessageMeta, Parser, ParserIO } from "../types";

const SELF = "You";
const SQLITE_HEADER = "SQLite format 3\u0000";
const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
const APPLE_EPOCH_MS = 978_307_200_000;
const TAPBACK_EMOJI: Record<number, string> = { 2000: "\u2764\ufe0f", 2001: "\ud83d\udc4d", 2002: "\ud83d\udc4e", 2003: "\ud83d\ude02", 2004: "\u203c\ufe0f", 2005: "\u2753" };
const GROUP_STYLE = 43;
const ITEM_TYPE_FACETIME = 6;

// Row dates are nanoseconds since 2001-01-01 on macOS 10.13+ and seconds before. The division happens in SQL because
// nanosecond counts exceed 2^53 and node:sqlite refuses to read them as numbers.
const DATE_MS_SQL = "CASE WHEN ABS(m.date) > 1000000000000 THEN m.date / 1000000 ELSE m.date * 1000 END";

interface Row {
  id: number;
  guid: string;
  text: string | null;
  body: Uint8Array | null;
  from_me: number;
  item_type: number | null;
  has_attachments: number | null;
  balloon: string | null;
  audio: number | null;
  edited: number | null;
  retracted: number | null;
  handle: string | null;
  date_ms: number | null;
}

interface ChatRow {
  id: number;
  guid: string | null;
  style: number | null;
  identifier: string | null;
  display_name: string | null;
}

interface Statement {
  all(...params: unknown[]): unknown[];
  iterate(...params: unknown[]): IterableIterator<unknown>;
}

interface Database {
  prepare(sql: string): Statement;
  close(): void;
}

export const imessageParser: Parser = {
  platform: "imessage",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!/\.(db|sqlite3?)$/i.test(entry.path)) continue;
      const head = await peek(entry);
      if (!head.startsWith(SQLITE_HEADER)) continue;
      if (/(^|\/)chat\.db$/i.test(entry.path) || /CREATE TABLE "?message"?\s*\(/.test(head)) claimed.push(entry);
    }
    return claimed;
  },
  async parse(entries, io) {
    for (const entry of entries) {
      const file = await materialize(entry);
      try {
        // Imported lazily: the module is only needed (and only loads cleanly) when an iMessage database is uploaded.
        const { DatabaseSync } = (await import("node:sqlite")) as unknown as {
          DatabaseSync: new (path: string, options: { readOnly: boolean }) => Database;
        };
        const db = new DatabaseSync(file.path, { readOnly: true });
        try {
          await parseDatabase(db, entry.path, io);
        } finally {
          db.close();
        }
      } finally {
        await file.cleanup();
      }
    }
  },
};

async function parseDatabase(db: Database, label: string, io: ParserIO) {
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
  if (!["message", "chat", "chat_message_join", "handle"].every((name) => tables.has(name))) {
    io.warn(label + ": not an iMessage database (missing message/chat tables)");
    return;
  }
  const columns = new Set((db.prepare("PRAGMA table_info(message)").all() as { name: string }[]).map((c) => c.name));
  const optional = (column: string, alias: string, fallback = "NULL") => (columns.has(column) ? "m." + column : fallback) + " AS " + alias;
  const select = [
    "m.ROWID AS id",
    "m.guid AS guid",
    "m.text AS text",
    optional("attributedBody", "body"),
    "m.is_from_me AS from_me",
    optional("item_type", "item_type"),
    optional("cache_has_attachments", "has_attachments"),
    optional("balloon_bundle_id", "balloon"),
    optional("is_audio_message", "audio"),
    columns.has("date_edited") ? "m.date_edited > 0 AS edited" : "NULL AS edited",
    columns.has("date_retracted") ? "m.date_retracted > 0 AS retracted" : "NULL AS retracted",
    "h.id AS handle",
    DATE_MS_SQL + " AS date_ms",
  ].join(", ");
  const tapbackFilter = columns.has("associated_message_type") ? "AND COALESCE(m.associated_message_type, 0) NOT BETWEEN 1000 AND 3999" : "";
  const messages = db.prepare(
    `SELECT ${select} FROM message m JOIN chat_message_join cmj ON cmj.message_id = m.ROWID LEFT JOIN handle h ON h.ROWID = m.handle_id WHERE cmj.chat_id = ? ${tapbackFilter} ORDER BY m.date, m.ROWID`,
  );
  const handles = tables.has("chat_handle_join")
    ? db.prepare("SELECT h.id AS id FROM chat_handle_join chj JOIN handle h ON h.ROWID = chj.handle_id WHERE chj.chat_id = ?")
    : null;
  const attachments =
    tables.has("message_attachment_join") && tables.has("attachment")
      ? db.prepare(
          "SELECT maj.message_id AS message_id, a.mime_type AS mime, a.transfer_name AS name FROM message_attachment_join maj JOIN attachment a ON a.ROWID = maj.attachment_id JOIN chat_message_join cmj ON cmj.message_id = maj.message_id WHERE cmj.chat_id = ?",
        )
      : null;
  const reactions = columns.has("associated_message_type") ? collectReactions(db, columns) : new Map<string, Map<string, string>>();

  for (const chat of db.prepare("SELECT ROWID AS id, guid, style, chat_identifier AS identifier, display_name FROM chat").all() as ChatRow[]) {
    const externalId = chat.identifier || chat.guid;
    if (!externalId) continue;
    try {
      const members = handles ? (handles.all(chat.id) as { id: string }[]).map((h) => h.id) : [];
      const kind = chat.style === GROUP_STYLE || members.length > 1 ? "group" : "dm";
      const title = chat.display_name?.trim() || (kind === "dm" ? externalId : "");
      const attachmentKinds = new Map<number, string[]>();
      for (const a of (attachments?.all(chat.id) ?? []) as { message_id: number; mime: string | null; name: string | null }[]) {
        if (/pluginPayloadAttachment$/i.test(a.name ?? "")) continue;
        const list = attachmentKinds.get(a.message_id) ?? [];
        list.push(attachmentKind(a.mime, a.name));
        attachmentKinds.set(a.message_id, list);
      }

      const senders = new Set<string>(members);
      let declared = false;
      let batch: MessageInput[] = [];
      for (const row of messages.iterate(chat.id) as IterableIterator<Row>) {
        const message = toMessage(row, attachmentKinds.get(row.id), reactions.get(row.guid));
        if (!message) continue;
        if (message.sender) senders.add(message.sender);
        if (!declared) {
          io.conversation({ externalId, title, kind, participants: [...senders], selfName: SELF });
          declared = true;
        }
        batch.push(message);
        if (batch.length >= 1000) {
          await io.messages(externalId, batch);
          batch = [];
        }
      }
      if (!declared) continue;
      if (batch.length) await io.messages(externalId, batch);
      io.conversation({ externalId, title, kind, participants: [...senders], selfName: SELF });
    } catch (error) {
      io.warn(label + ": skipped chat " + externalId + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
}

/** Tapbacks arrive as their own rows after the message they react to; fold them into a map keyed by target guid. */
function collectReactions(db: Database, columns: Set<string>): Map<string, Map<string, string>> {
  const emoji = columns.has("associated_message_emoji") ? "m.associated_message_emoji" : "NULL";
  const rows = db
    .prepare(
      `SELECT m.associated_message_guid AS target, m.associated_message_type AS type, ${emoji} AS emoji, m.is_from_me AS from_me, h.id AS handle FROM message m LEFT JOIN handle h ON h.ROWID = m.handle_id WHERE m.associated_message_type BETWEEN 2000 AND 3999 AND m.associated_message_guid IS NOT NULL ORDER BY m.date, m.ROWID`,
    )
    .all() as { target: string; type: number; emoji: string | null; from_me: number; handle: string | null }[];
  const byTarget = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const target = row.target.replace(/^(?:p:\d+\/|bp:)/, "");
    const sender = row.from_me ? SELF : row.handle ?? "Unknown";
    const current = byTarget.get(target) ?? new Map<string, string>();
    if (row.type >= 3000) current.delete(sender);
    else {
      const reaction = row.type === 2006 ? row.emoji : TAPBACK_EMOJI[row.type];
      if (reaction) current.set(sender, reaction);
    }
    byTarget.set(target, current);
  }
  return byTarget;
}

function toMessage(row: Row, attachmentKinds: string[] | undefined, reactions: Map<string, string> | undefined): MessageInput | null {
  if (row.date_ms === null) return null;
  const ts = Math.round(Number(row.date_ms)) + APPLE_EPOCH_MS;
  const fromMe = !!row.from_me;
  const itemType = row.item_type ?? 0;
  if (itemType === ITEM_TYPE_FACETIME) return { ts, sender: fromMe ? SELF : row.handle ?? "Unknown", kind: "call", text: null };
  if (itemType !== 0) return { ts, sender: "", kind: "system", text: null };

  const sender = fromMe ? SELF : row.handle ?? "Unknown";
  if (row.retracted) return { ts, sender, kind: "deleted", text: null };

  const raw = row.text ?? (row.body ? decodeAttributedBody(row.body) : null) ?? "";
  const text = raw.replace(/\ufffc/g, "").replace(INVISIBLE_RE, "").trim();
  const media = [...(attachmentKinds ?? [])];
  if (row.audio && !media.includes("audio")) media.push("audio");
  if (!media.length && raw.includes("\ufffc")) media.push("file");
  if (!media.length && !text && row.balloon) media.push("share");
  if (!media.length && !text) return null;

  const meta: MessageMeta = {};
  if (media.length) meta.media = [...new Set(media)];
  if (row.edited) meta.edited = true;
  if (reactions?.size) meta.reactions = [...reactions].map(([who, emoji]) => ({ sender: who, emoji }));
  return { ts, sender, kind: media.length ? "media" : "text", text: text || null, ...(Object.keys(meta).length ? { meta } : {}) };
}

function attachmentKind(mime: string | null, name: string | null): string {
  const type = (mime ?? "").toLowerCase();
  const file = (name ?? "").toLowerCase();
  if (type === "image/gif" || file.endsWith(".gif")) return "gif";
  if (type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/.test(file)) return "photo";
  if (type.startsWith("video/") || /\.(mov|mp4|m4v)$/.test(file)) return "video";
  if (type.startsWith("audio/") || /\.(caf|m4a|mp3|amr)$/.test(file)) return "audio";
  if (type === "text/x-vlocation" || file.endsWith(".loc.vcf")) return "location";
  if (type === "text/vcard" || file.endsWith(".vcf")) return "contact";
  return "file";
}

/**
 * Text of an NSArchiver typedstream (message.attributedBody): the UTF-8 string follows the "NSString" class
 * record and a "+" type tag, prefixed by its byte length (one byte, or 0x81 + uint16 / 0x82 + uint32, little endian).
 */
export function decodeAttributedBody(blob: Uint8Array): string | null {
  const buffer = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  let marker = buffer.indexOf("NSString");
  if (marker < 0) marker = buffer.indexOf("NSMutableString");
  if (marker < 0) return null;
  const limit = Math.min(buffer.length - 1, marker + 40);
  let p = -1;
  for (let i = marker; i < limit; i++) {
    if (buffer[i] === 0x01 && buffer[i + 1] === 0x2b) {
      p = i + 2;
      break;
    }
  }
  if (p < 0 || p >= buffer.length) return null;
  let length = buffer[p];
  if (length === 0x81 && p + 3 <= buffer.length) {
    length = buffer.readUInt16LE(p + 1);
    p += 3;
  } else if (length === 0x82 && p + 5 <= buffer.length) {
    length = buffer.readUInt32LE(p + 1);
    p += 5;
  } else if (length >= 0x80) return null;
  else p += 1;
  return buffer.toString("utf8", p, Math.min(p + length, buffer.length));
}
