import { unzipSync, strFromU8 } from "fflate";
import { parseIMessage, looksLikeIMessage } from "./imessage.ts";
import { parseWhatsApp, looksLikeWhatsApp } from "./whatsapp.ts";
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

export interface TextIngestOptions {
  selfName?: string;
  title?: string;
}

export function ingestText(raw: string, opts: TextIngestOptions = {}): Conversation {
  if (looksLikeWhatsApp(raw)) return parseWhatsApp(raw, opts);
  if (looksLikeIMessage(raw)) return parseIMessage(raw, opts);
  throw new Error("Unrecognized chat export: expected a WhatsApp export or imessage-exporter txt output.");
}

export function ingestWhatsAppZip(bytes: Uint8Array, opts: TextIngestOptions = {}): Conversation {
  const files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith(".txt") });
  const name = Object.keys(files).find((n) => /_chat\.txt$|chat\.txt$/i.test(n)) ?? Object.keys(files)[0];
  if (!name) throw new Error("No .txt chat file found inside the WhatsApp zip.");
  return parseWhatsApp(strFromU8(files[name]), opts);
}
