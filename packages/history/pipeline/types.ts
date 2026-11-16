import type { ConversationKind, MessageKind, Platform } from "../convex/validators";

export type { ConversationKind, MessageKind, Platform };

/** One file inside an uploaded export: a zip entry, or the uploaded file itself. */
export interface ArchiveEntry {
  /** Path inside the upload with forward slashes, e.g. "messages/inbox/sam_123/message_1.json". */
  path: string;
  /** Uncompressed size in bytes. */
  size: number;
  /** Streams the uncompressed bytes. Each call starts a fresh stream. */
  open(): AsyncIterable<Uint8Array>;
  /** Set when the entry is a plain file on local disk. */
  filePath?: string;
}

export interface Archive {
  /** The uploaded file's name, e.g. "WhatsApp Chat - Sam.zip". */
  name: string;
  entries: ArchiveEntry[];
  close(): Promise<void>;
}

export interface ConversationInput {
  /** Stable id within the platform (thread folder, chat id, channel id, chat title), so re-uploads merge. */
  externalId: string;
  /** Display title. Empty string when the export has none; it is derived from participants later. */
  title: string;
  kind: ConversationKind;
  /** Sender names exactly as they appear on messages, including the user when known. */
  participants: string[];
  /** The user's sender name in this conversation, when the export states it explicitly. */
  selfName?: string | null;
}

export interface MessageMeta {
  /** Attachment kinds, e.g. ["photo"], ["video"], ["audio"], ["sticker"], ["gif"], ["file"], ["share"], ["location"]. */
  media?: string[];
  edited?: boolean;
  reactions?: { sender: string; emoji: string }[];
  /** Model that produced an AI reply. */
  model?: string;
  /** Call length. */
  durationSec?: number;
}

export interface MessageInput {
  /** Epoch milliseconds, UTC. */
  ts: number;
  /** Sender name as shown in the export. Empty string for system messages. */
  sender: string;
  kind: MessageKind;
  text: string | null;
  meta?: MessageMeta;
}

export interface ParserIO {
  /** The uploaded file's name (e.g. "WhatsApp Chat - Sam.zip"); some exports only carry the chat title there. */
  archiveName: string;
  /** Converts a wall-clock time with no zone (WhatsApp, CSV) to epoch ms in the user's time zone. Month is 1-12. */
  fromLocal(year: number, month: number, day: number, hour: number, minute: number, second: number): number;
  /** Declares or updates a conversation. Repeated calls merge: participants union, later title/kind/selfName win. */
  conversation(meta: ConversationInput): void;
  /** Adds messages to a declared conversation. Await it: it applies backpressure while rows are written. */
  messages(externalId: string, batch: MessageInput[]): Promise<void>;
  /** Names the export says belong to the user (profile files, account info). */
  selfHint(names: string[]): void;
  warn(message: string): void;
}

export interface Parser {
  platform: Platform;
  /** Picks the entries this parser handles. `peek` returns the first 4 KB of an entry as text. */
  claim(entries: ArchiveEntry[], peek: (entry: ArchiveEntry) => Promise<string>): Promise<ArchiveEntry[]>;
  parse(entries: ArchiveEntry[], io: ParserIO): Promise<void>;
}
