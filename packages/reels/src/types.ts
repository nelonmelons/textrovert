export const PLATFORMS = ["instagram", "imessage", "whatsapp", "messenger", "telegram", "sms", "other"] as const;
export type ReelPlatform = (typeof PLATFORMS)[number];

export const MOODS = ["hype", "chill", "planning", "venting", "banter", "serious", "wholesome", "chaotic"] as const;
export type ReelMood = (typeof MOODS)[number];

export type MediaKind = "photo" | "video" | "audio" | "sticker" | "gif" | "file" | "share" | "location";

export interface ReelParticipant {
  /** Display name; the user is always "Me". */
  name: string;
  /** Stable CSS color for avatars, names and the highlight accent. */
  color: string;
  isMe: boolean;
}

export interface ReelMessage {
  id: number;
  /** Display name, matching a participant. */
  sender: string;
  isMe: boolean;
  text: string | null;
  /** Epoch milliseconds. */
  ts: number;
  media?: MediaKind;
  reactions?: string[];
  /** How many messages of the source chat were left out right before this one. */
  skippedBefore?: number;
}

export interface ReelPlan {
  /** Short label, e.g. "fly to Shanghai". */
  what: string;
  /** YYYY-MM-DD when the chat pins down a day. */
  date: string | null;
  /** Timing as said in the chat, used when there is no date. */
  when: string;
}

export type ReelProps = {
  chat: {
    title: string;
    platform: ReelPlatform;
    kind: "dm" | "group";
  };
  participants: ReelParticipant[];
  episode: {
    title: string;
    summary: string;
    startTs: number;
    endTs: number;
    mood: ReelMood;
    /** IANA zone used to print dates and times. */
    timeZone: string;
  };
  /** Chronological. */
  messages: ReelMessage[];
  /** Ids of messages to blow up full screen, in the order they appear. At most two are shown. */
  highlights: number[];
  plans: ReelPlan[];
  /** http(s) URLs, data URLs, or paths inside the package's public/ folder; empty for no collage. */
  photos: string[];
};
