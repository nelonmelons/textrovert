import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

import type { ReelMood, ReelPlatform } from "./types";

export const DISPLAY_FONT = loadSerif("normal", { subsets: ["latin", "latin-ext"] }).fontFamily;
loadSerif("italic", { subsets: ["latin", "latin-ext"] });
export const UI_FONT = loadInter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily;
/** Chat bubbles use the phone's own font so they read like a screenshot. */
export const CHAT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

export interface Palette {
  /** Base background color. */
  base: string;
  /** Three blob colors drifting behind everything. */
  blobs: [string, string, string];
  accent: string;
  ink: string;
  sub: string;
  dark: boolean;
  emoji: string;
}

export const PALETTES: Record<ReelMood, Palette> = {
  hype: { base: "#16040f", blobs: ["#ff3d7f", "#ff8a00", "#ffcf3f"], accent: "#ff6b9a", ink: "#ffffff", sub: "rgba(255,255,255,0.72)", dark: true, emoji: "🔥" },
  wholesome: { base: "#fff3ea", blobs: ["#ffb4a2", "#ffd6a5", "#cdb4db"], accent: "#e2607a", ink: "#3a1f1a", sub: "rgba(58,31,26,0.66)", dark: false, emoji: "🫶" },
  planning: { base: "#04101d", blobs: ["#2e7dff", "#00c2a8", "#7b61ff"], accent: "#6be4ff", ink: "#ffffff", sub: "rgba(255,255,255,0.7)", dark: true, emoji: "🗺️" },
  banter: { base: "#110a22", blobs: ["#b8f53a", "#8b5cf6", "#ff5fa2"], accent: "#c6ff3d", ink: "#ffffff", sub: "rgba(255,255,255,0.7)", dark: true, emoji: "😂" },
  chill: { base: "#0d1020", blobs: ["#7aa2ff", "#b39ddb", "#80deea"], accent: "#a5b8ff", ink: "#ffffff", sub: "rgba(255,255,255,0.7)", dark: true, emoji: "🌙" },
  venting: { base: "#13060b", blobs: ["#e0435a", "#7b2cbf", "#ff7a59"], accent: "#ff8a9b", ink: "#ffffff", sub: "rgba(255,255,255,0.7)", dark: true, emoji: "🫂" },
  serious: { base: "#0b0f15", blobs: ["#3b4a63", "#5b6b85", "#8796ad"], accent: "#cbd5e1", ink: "#ffffff", sub: "rgba(255,255,255,0.68)", dark: true, emoji: "💬" },
  chaotic: { base: "#09090b", blobs: ["#ff00d4", "#00e5ff", "#ffe600"], accent: "#ffe600", ink: "#ffffff", sub: "rgba(255,255,255,0.72)", dark: true, emoji: "🌀" },
};

export interface Skin {
  label: string;
  dark: boolean;
  screen: string;
  header: string;
  headerBorder: string;
  title: string;
  sub: string;
  meBubble: string;
  meText: string;
  otherBubble: string;
  otherText: string;
  /** Group sender names: inside the bubble in each sender's color (WhatsApp), or above it in gray. */
  namesInside: boolean;
  nameColor: string;
  radius: number;
  /** Corner radius on the sender's side between consecutive bubbles of one run. */
  joinRadius: number;
  /** Little tail on the last bubble of a run (iMessage, WhatsApp). */
  tail: boolean;
  /** Avatar beside the last bubble of someone else's run (Instagram, Messenger). */
  avatars: boolean;
  timeInBubble: boolean;
  separator: string;
  reactionBg: string;
  composer: string;
  composerText: string;
  pattern?: string;
}

const instagram: Skin = {
  label: "Instagram",
  dark: true,
  screen: "#000000",
  header: "#000000",
  headerBorder: "rgba(255,255,255,0.12)",
  title: "#ffffff",
  sub: "#a8a8a8",
  meBubble: "linear-gradient(160deg, #a034fa 0%, #7b4dff 45%, #3f7bff 100%)",
  meText: "#ffffff",
  otherBubble: "#262626",
  otherText: "#f5f5f5",
  namesInside: false,
  nameColor: "#a8a8a8",
  radius: 44,
  joinRadius: 10,
  tail: false,
  avatars: true,
  timeInBubble: false,
  separator: "#a8a8a8",
  reactionBg: "#262626",
  composer: "#262626",
  composerText: "#a8a8a8",
};

const imessage: Skin = {
  label: "iMessage",
  dark: false,
  screen: "#ffffff",
  header: "rgba(246,246,248,0.96)",
  headerBorder: "rgba(0,0,0,0.12)",
  title: "#000000",
  sub: "#8e8e93",
  meBubble: "linear-gradient(180deg, #2a9bff 0%, #0a7cff 100%)",
  meText: "#ffffff",
  otherBubble: "#e9e9eb",
  otherText: "#000000",
  namesInside: false,
  nameColor: "#8e8e93",
  radius: 42,
  joinRadius: 42,
  tail: true,
  avatars: false,
  timeInBubble: false,
  separator: "#8e8e93",
  reactionBg: "#e9e9eb",
  composer: "#ffffff",
  composerText: "#c7c7cc",
};

const whatsapp: Skin = {
  label: "WhatsApp",
  dark: false,
  screen: "#efeae2",
  header: "#ffffff",
  headerBorder: "rgba(0,0,0,0.08)",
  title: "#111b21",
  sub: "#667781",
  meBubble: "#d9fdd3",
  meText: "#111b21",
  otherBubble: "#ffffff",
  otherText: "#111b21",
  namesInside: true,
  nameColor: "#667781",
  radius: 18,
  joinRadius: 18,
  tail: true,
  avatars: false,
  timeInBubble: true,
  separator: "#54656f",
  reactionBg: "#ffffff",
  composer: "#ffffff",
  composerText: "#8696a0",
  pattern: "radial-gradient(rgba(0,0,0,0.045) 2px, transparent 2.5px) 0 0 / 46px 46px",
};

export const SKINS: Record<ReelPlatform, Skin> = {
  instagram,
  imessage,
  whatsapp,
  messenger: { ...instagram, label: "Messenger", meBubble: "linear-gradient(170deg, #a033ff 0%, #ff5280 55%, #ff7061 100%)" },
  telegram: { ...whatsapp, label: "Telegram", screen: "#a8c49a", meBubble: "#effdde", pattern: "radial-gradient(rgba(255,255,255,0.18) 2px, transparent 2.5px) 0 0 / 52px 52px" },
  sms: { ...imessage, label: "Messages", meBubble: "linear-gradient(180deg, #43d25f 0%, #30c048 100%)" },
  other: { ...imessage, label: "Messages" },
};

