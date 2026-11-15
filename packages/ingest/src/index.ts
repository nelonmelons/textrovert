import { unzipSync, strFromU8 } from "fflate";
import { parseIMessage, looksLikeIMessage } from "./imessage.ts";
import { parseWhatsApp, looksLikeWhatsApp } from "./whatsapp.ts";
import { ingestInstagramExport, looksLikeInstagramExport } from "./instagram.ts";
import type { Conversation } from "./types.ts";

export type * from "./types.ts";
export { parseWhatsApp } from "./whatsapp.ts";
export { parseIMessage } from "./imessage.ts";
export { framesToConversation, stitchFrames, parseDivider, FRAME_PROMPT, WINDOW_PROMPT, FRAME_JSON_SCHEMA } from "./screenshots.ts";
export type { FrameExtraction, FrameItem } from "./screenshots.ts";
export { extractFrame, extractFrames, extractWindow } from "./vision.ts";
export { readRecording } from "./recording.ts";
export type { RecordingOptions } from "./recording.ts";
export type { FrameInput, VisionOptions } from "./vision.ts";
export { renderTranscript, renderLine, computeStats } from "./transcript.ts";
export { reassignSelf } from "./conversation.ts";
export { ingestInstagramExport, parseInstagramThread, fixMojibake } from "./instagram.ts";
export { rankConversations } from "./rank.ts";
export type { ChatSummary } from "./rank.ts";

export interface TextIngestOptions {
  selfName?: string;
  title?: string;
}

export function ingestText(raw: string, opts: TextIngestOptions = {}): Conversation {
  if (looksLikeWhatsApp(raw)) return parseWhatsApp(raw, opts);
  if (looksLikeIMessage(raw)) return parseIMessage(raw, opts);
  throw new Error("Unrecognized chat export: expected a WhatsApp export or imessage-exporter txt output.");
}

export function ingestZip(bytes: Uint8Array, opts: TextIngestOptions = {}): Conversation[] {
  const names: string[] = [];
  unzipSync(bytes, {
    filter: (f) => {
      names.push(f.name);
      return false;
    },
  });
  if (looksLikeInstagramExport(names)) return ingestInstagramExport(bytes, opts);
  const files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith(".txt") && !f.name.startsWith("__MACOSX/") });
  const conversations = Object.entries(files).flatMap(([name, data]) => {
    try {
      const conv = ingestText(strFromU8(data), opts);
      conv.sourceId = name;
      conv.title ??= name.split("/").pop()!.replace(/\.txt$/i, "");
      return conv.messages.length ? [conv] : [];
    } catch {
      return [];
    }
  });
  if (!conversations.length) throw new Error("No WhatsApp, iMessage, or Instagram chats found inside the zip.");
  return conversations;
}

export function ingestWhatsAppZip(bytes: Uint8Array, opts: TextIngestOptions = {}): Conversation {
  const files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith(".txt") });
  const name = Object.keys(files).find((n) => /_chat\.txt$|chat\.txt$/i.test(n)) ?? Object.keys(files)[0];
  if (!name) throw new Error("No .txt chat file found inside the WhatsApp zip.");
  return parseWhatsApp(strFromU8(files[name]), opts);
}
