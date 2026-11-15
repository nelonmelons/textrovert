import type { Archive, Parser, Platform } from "../types";
import type { RecordedChat } from "./frames";

const PLATFORMS: Platform[] = ["whatsapp", "imessage", "instagram", "messenger", "telegram", "discord", "snapchat"];

/** The platform a recording came from, as far as the vision model could tell; Instagram when it couldn't. */
export function recordingPlatform(chat: RecordedChat): Platform {
  return PLATFORMS.find((p) => p === chat.platform) ?? "instagram";
}

/**
 * Feeds an already-read screen recording through the normal ingest pipeline, so its messages are deduplicated,
 * stored, and analyzed exactly like an export. Re-recording the same chat merges into the same conversation.
 */
export function recordingParser(chat: RecordedChat): { parser: Parser; archive: Archive } {
  const externalId = "recording:" + chat.title.toLowerCase().trim();
  const parser: Parser = {
    platform: recordingPlatform(chat),
    claim: async (entries) => entries,
    async parse(_entries, io) {
      const selfName = chat.messages.find((m) => m.isSelf)?.sender ?? null;
      io.conversation({ externalId, title: chat.title, kind: chat.isGroup ? "group" : "dm", participants: chat.participants, selfName });
      for (const warning of chat.warnings) io.warn(warning);
      await io.messages(
        externalId,
        chat.messages.map((m) => ({
          ts: io.fromLocal(m.local[0], m.local[1], m.local[2], m.local[3], m.local[4], 0),
          sender: m.sender,
          kind: m.kind,
          text: m.text,
          ...(m.meta ? { meta: m.meta } : {}),
        })),
      );
    },
  };
  const archive: Archive = {
    name: chat.title,
    entries: [{ path: "recording", size: 0, open: async function* () {} }],
    close: async () => {},
  };
  return { parser, archive };
}
