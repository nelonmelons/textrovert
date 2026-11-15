import type { ReelMessage, ReelProps } from "./types";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

const TITLE = 84;
const HIGHLIGHT = 78;
const PLANS_BASE = 60;
const PLANS_PER_ITEM = 14;
const COLLAGE = 105;
const OUTRO = 72;
const MIN_TOTAL = 15 * FPS;
const MAX_TOTAL = 30 * FPS;
const CHAT_MIN = 6 * FPS;
const CHAT_MAX = 17 * FPS;
const CHAT_LEAD_IN = 16;
const CHAT_TAIL = 30;
/** Chat time the highlighted bubble stays on screen before cutting to its big-type moment. */
const HIGHLIGHT_CUT_AFTER = 20;
export const MAX_HIGHLIGHTS = 2;
export const MAX_PLANS = 5;
export const MAX_PHOTOS = 6;
/** A silence this long between two shown messages gets a time separator. */
export const SEPARATOR_GAP_MS = 60 * 60_000;
/** Fewer left-out messages than this are cut silently; more get a "messages later" marker. */
export const SKIP_MARKER_MIN = 3;
/** Chat time shown before the first cut to a highlight, and between two cuts. */
const MIN_CHAT_BEFORE_CUT = 75;

/** When a message's typing indicator starts and when the bubble lands, in chat-time frames. */
export interface Beat {
  id: number;
  typingAt: number | null;
  appearAt: number;
}

export type Scene =
  | { kind: "title"; from: number; duration: number }
  | { kind: "chat"; from: number; duration: number; chatFrom: number }
  | { kind: "highlight"; from: number; duration: number; messageId: number }
  | { kind: "plans"; from: number; duration: number }
  | { kind: "collage"; from: number; duration: number }
  | { kind: "outro"; from: number; duration: number };

type WithoutFrom<S> = S extends unknown ? Omit<S, "from"> : never;

export interface Timeline {
  scenes: Scene[];
  beats: Beat[];
  /** Highlight ids that are actually shown. */
  highlights: number[];
  durationInFrames: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const textLength = (m: ReelMessage) => (m.text ? [...m.text].length : 12);

/** What goes above a message: a timestamp (first message or after a long silence), a skip marker, or nothing. */
export function separatorBefore(prev: ReelMessage | undefined, m: ReelMessage): "time" | "skip" | null {
  if (!prev || m.ts - prev.ts >= SEPARATOR_GAP_MS) return "time";
  return (m.skippedBefore ?? 0) >= SKIP_MARKER_MIN ? "skip" : null;
}

/** Highlights that point at shown text messages, in chat order, at most two. */
export function shownHighlights(props: ReelProps): number[] {
  const wanted = new Set(props.highlights);
  return props.messages.filter((m) => wanted.has(m.id) && m.text).slice(0, MAX_HIGHLIGHTS).map((m) => m.id);
}

/**
 * Natural chat pacing: others "type" for a beat that grows with message length, everyone reads for a while after a
 * bubble lands, and silences or skipped stretches get a pause for their separator. The whole chat is then squeezed
 * or stretched so the reel lands between 15 and 30 seconds.
 */
export function computeTimeline(props: ReelProps): Timeline {
  const highlights = shownHighlights(props);
  const hasPlans = props.plans.length > 0;
  const hasPhotos = props.photos.length > 0;
  const others =
    TITLE +
    highlights.length * HIGHLIGHT +
    (hasPlans ? PLANS_BASE + Math.min(props.plans.length, MAX_PLANS) * PLANS_PER_ITEM : 0) +
    (hasPhotos ? COLLAGE : 0) +
    OUTRO;

  const raw: { typing: number; appear: number }[] = [];
  let t = CHAT_LEAD_IN;
  props.messages.forEach((m, i) => {
    const prev = props.messages[i - 1];
    if (prev) t += clamp(8 + textLength(prev) * 0.45, 12, 40) + (highlights.includes(prev.id) ? 10 : 0);
    if (prev && separatorBefore(prev, m)) t += 10;
    const typing = !m.isMe && (!prev || prev.sender !== m.sender) ? clamp(10 + textLength(m) * 0.2, 10, 22) : 0;
    t += typing;
    raw.push({ typing, appear: t });
  });
  const last = props.messages[props.messages.length - 1];
  const rawEnd = t + (last ? clamp(8 + textLength(last) * 0.45, 12, 40) : 0) + CHAT_TAIL;

  const lo = Math.max(CHAT_MIN, MIN_TOTAL - others);
  const hi = Math.max(lo, Math.min(CHAT_MAX, MAX_TOTAL - others));
  const scale = rawEnd > hi ? hi / rawEnd : rawEnd < lo ? Math.min(lo / rawEnd, 1.6) : 1;
  const beats: Beat[] = props.messages.map((m, i) => {
    const appearAt = Math.round(raw[i].appear * scale);
    return { id: m.id, appearAt, typingAt: raw[i].typing ? Math.max(0, appearAt - Math.round(raw[i].typing * scale)) : null };
  });
  const chatDuration = Math.round(rawEnd * scale);

  const scenes: Scene[] = [];
  let at = 0;
  const push = (scene: WithoutFrom<Scene>) => {
    scenes.push({ ...scene, from: at } as Scene);
    at += scene.duration;
  };
  push({ kind: "title", duration: TITLE });
  let chatAt = 0;
  for (const id of highlights) {
    const beat = beats.find((b) => b.id === id)!;
    const cut = Math.min(chatDuration, Math.max(beat.appearAt + HIGHLIGHT_CUT_AFTER, chatAt + MIN_CHAT_BEFORE_CUT));
    if (cut - chatAt >= 12) {
      push({ kind: "chat", duration: cut - chatAt, chatFrom: chatAt });
      chatAt = cut;
    }
    push({ kind: "highlight", duration: HIGHLIGHT, messageId: id });
  }
  if (chatDuration - chatAt >= 12) push({ kind: "chat", duration: chatDuration - chatAt, chatFrom: chatAt });
  if (hasPlans) push({ kind: "plans", duration: PLANS_BASE + Math.min(props.plans.length, MAX_PLANS) * PLANS_PER_ITEM });
  if (hasPhotos) push({ kind: "collage", duration: COLLAGE });
  push({ kind: "outro", duration: OUTRO });

  return { scenes, beats, highlights, durationInFrames: at };
}
