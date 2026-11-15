import { MAX_TEXT_ENTRY_BYTES, readJson } from "../archive";
import type { MessageInput, MessageMeta, Parser, Platform } from "../types";

/** File format written by scripts/beeper-export.ts: one JSON file per chat, read from the Beeper Desktop API. */
export const BEEPER_FORMAT = "textrovert-beeper-export";

export interface BeeperChatFile {
  format: typeof BEEPER_FORMAT;
  /** First so a 4 KB peek can route the file to the right parser. */
  platform: Platform;
  chat: {
    id: string;
    title: string;
    type: "single" | "group";
    network: string;
    participants: { id: string; name: string; isSelf: boolean }[];
  };
  messages: {
    id: string;
    senderID: string;
    senderName: string | null;
    isSender: boolean;
    timestamp: string;
    text: string | null;
    type: string | null;
    attachments: { type: string; isGif?: boolean; isSticker?: boolean; isVoiceNote?: boolean; duration?: number }[];
    isDeleted: boolean;
    edited: boolean;
    reactions: { participantID: string; reactionKey: string }[];
  }[];
}

/** Maps a Beeper network name ("WhatsApp", "Instagram", "Google Messages", ...) to a platform. */
export function beeperPlatform(network: string): Platform {
  const n = network.toLowerCase().replace(/[^a-z]/g, "");
  if (n.includes("whatsapp")) return "whatsapp";
  if (n.includes("instagram")) return "instagram";
  if (n.includes("messenger") || n.includes("facebook")) return "messenger";
  if (n.includes("imessage") || n === "apple") return "imessage";
  if (n.includes("telegram")) return "telegram";
  if (n.includes("discord")) return "discord";
  if (n.includes("signal")) return "signal";
  if (n.includes("slack")) return "slack";
  if (n.includes("googlemessages") || n.includes("googlevoice") || n.includes("sms") || n.includes("gmessages")) return "sms";
  return "other";
}

const PLATFORMS: Platform[] = ["whatsapp", "instagram", "messenger", "imessage", "telegram", "discord", "signal", "slack", "sms", "other"];

function mediaOf(a: BeeperChatFile["messages"][number]["attachments"][number]): string {
  if (a.isSticker) return "sticker";
  if (a.isGif) return "gif";
  if (a.isVoiceNote || a.type === "audio") return "audio";
  if (a.type === "img") return "photo";
  if (a.type === "video") return "video";
  return "file";
}

function beeperParser(platform: Platform): Parser {
  const marker = new RegExp(`"format"\\s*:\\s*"${BEEPER_FORMAT}"\\s*,\\s*"platform"\\s*:\\s*"${platform}"`);
  return {
    platform,
    async claim(entries, peek) {
      const claimed = [];
      for (const entry of entries) if (/\.json$/i.test(entry.path) && marker.test(await peek(entry))) claimed.push(entry);
      return claimed;
    },
    async parse(entries, io) {
      for (const entry of entries) {
        const file = (await readJson(entry, MAX_TEXT_ENTRY_BYTES)) as BeeperChatFile;
        const names = new Map(file.chat.participants.map((p) => [p.id, p.name]));
        const self = file.chat.participants.find((p) => p.isSelf);
        const selfName = self?.name || "Me";
        const senderOf = (m: BeeperChatFile["messages"][number]) =>
          m.isSender ? selfName : m.senderName || names.get(m.senderID) || m.senderID;
        io.conversation({
          externalId: "beeper:" + file.chat.id,
          title: file.chat.title,
          kind: file.chat.type === "group" ? "group" : "dm",
          participants: [...new Set([...file.chat.participants.map((p) => (p.isSelf ? selfName : p.name || p.id))])],
          selfName,
        });
        const batch: MessageInput[] = [];
        for (const m of file.messages) {
          if (m.type === "REACTION") continue;
          const meta: MessageMeta = {};
          const media = m.attachments.map(mediaOf);
          if (m.type === "LOCATION") media.push("location");
          if (media.length) meta.media = media;
          if (m.edited) meta.edited = true;
          if (m.reactions.length) meta.reactions = m.reactions.map((r) => ({ sender: names.get(r.participantID) ?? r.participantID, emoji: r.reactionKey }));
          const duration = m.attachments.find((a) => a.duration)?.duration;
          if (duration) meta.durationSec = duration;
          batch.push({
            ts: Date.parse(m.timestamp),
            sender: m.type === "NOTICE" ? "" : senderOf(m),
            kind: m.isDeleted ? "deleted" : m.type === "NOTICE" ? "system" : media.length && !m.text ? "media" : "text",
            text: m.isDeleted ? null : m.text,
            ...(Object.keys(meta).length ? { meta } : {}),
          });
        }
        batch.sort((a, b) => a.ts - b.ts);
        await io.messages("beeper:" + file.chat.id, batch);
      }
    },
  };
}

/** One parser per platform, so chats from every network Beeper bridges land under their own app. */
export const beeperParsers: Parser[] = PLATFORMS.map(beeperParser);
