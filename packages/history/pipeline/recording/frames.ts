import type { MessageKind, MessageMeta } from "../types";

/** [year, month 1-12, day, hour, minute] in the chat's local time. */
export type LocalParts = [number, number, number, number, number];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

function to24h(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const pm = meridiem.toLowerCase().startsWith("p");
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

export type Side = "left" | "right" | "center";
export type FrameKind = "text" | "media" | "link" | "call" | "system" | "unsent";

export interface FrameItem {
  type: "divider" | "message" | "system";
  side: Side;
  text: string;
  senderLabel: string | null;
  replyHeader: string | null;
  quoted: string | null;
  kind: FrameKind;
  reactions: string[];
  cutOff: boolean;
}

export interface FrameExtraction {
  frame: number;
  timeSec: number | null;
  platform: string | null;
  chatTitle: string | null;
  items: FrameItem[];
}

export const FRAME_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["platform", "chatTitle", "items"],
  properties: {
    platform: { type: ["string", "null"], description: "instagram, imessage, hinge, whatsapp, tinder, snapchat, or other" },
    chatTitle: { type: ["string", "null"], description: "Name shown in the chat header, exactly as displayed" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "side", "text", "senderLabel", "replyHeader", "quoted", "kind", "reactions", "cutOff"],
        properties: {
          type: { type: "string", enum: ["divider", "message", "system"] },
          side: { type: "string", enum: ["left", "right", "center"] },
          text: { type: "string" },
          senderLabel: { type: ["string", "null"] },
          replyHeader: { type: ["string", "null"] },
          quoted: { type: ["string", "null"] },
          kind: { type: "string", enum: ["text", "media", "link", "call", "system", "unsent"] },
          reactions: { type: "array", items: { type: "string" } },
          cutOff: { type: "boolean" },
        },
      },
    },
  },
} as const;

export const WINDOW_PROMPT = `You are given several consecutive frames, in time order, from a phone screen recording of a chat app (Instagram DMs, iMessage, Hinge, WhatsApp, etc.). The user is scrolling, usually upward toward older messages, so the same bubbles appear in several frames at different heights. Some frames may be motion-blurred; use the sharpest frame for each bubble.

Reconstruct the single conversation visible across ALL frames: every distinct chat element exactly once, ordered oldest (top of the conversation) to newest (bottom). Do not repeat a bubble because it appears in multiple frames, and do not output a reply's faded quoted text as its own message. Set cutOff=true only if the element is not fully visible in any frame. Ignore the status bar, app header, keyboard, and composer.

Field rules are the same as for a single frame:
`;
export const FRAME_PROMPT = `You are transcribing one frame of a phone screen recording of a chat app (Instagram DMs, iMessage, Hinge, WhatsApp, etc.).
List every chat element visible inside the conversation area, strictly top to bottom. Ignore the status bar, app header, keyboard, and message composer.

For each element output:
- type: "divider" for centered date/time separators (e.g. "OCT 30, 11:05 A.M.", "Today 9:41 PM", "FRI 9:04 P.M."), "system" for centered notices (e.g. "Video call ended", "X named the group"), otherwise "message".
- side: "right" for bubbles sent by the phone owner (right-aligned), "left" for bubbles from others, "center" for dividers and system notices.
- text: the exact text, preserving spelling, slang, emoji and line breaks. For media write a short bracketed description like "[photo]", "[video]", "[reel shared by @handle]", "[voice message 0:12]", "[sticker]". For a shared link write the URL or link title.
- senderLabel: the small name printed directly above a left-side bubble (group chats), else null. Never guess a name that is not printed above that bubble.
- replyHeader: small header text above a reply bubble such as "Emma Di replied to lin" or "You replied to them", else null.
- quoted: the faded quoted message shown inside or above a reply bubble, else null.
- kind: text, media, link, call, system, or unsent ("unsent a message", "This message was deleted").
- reactions: emoji reactions shown attached under that bubble (e.g. ["❤️","😂"]). Ignore small avatar "seen" indicators.
- cutOff: true if the element is partially cut off by the top or bottom edge of the conversation area.

If the frame is blurry from scrolling, transcribe what you can read and mark unreadable bubbles cutOff=true.
Return JSON only.`;

function norm(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\p{Extended_Pictographic}]+/gu, " ").trim();
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let k = 0; k < s.length - 1; k++) {
    const g = s.slice(k, k + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bx = bigrams(x);
  const by = bigrams(y);
  let overlap = 0;
  for (const [g, n] of bx) overlap += Math.min(n, by.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

function sameItem(a: FrameItem, b: FrameItem): boolean {
  if ((a.type === "divider") !== (b.type === "divider")) return false;
  const threshold = Math.min(norm(a.text).length, norm(b.text).length) > 12 ? 0.8 : 0.95;
  return similarity(a.text, b.text) >= threshold;
}

interface Placed extends FrameItem {
  frames: number[];
  sideVotes: { left: number; right: number };
}

const GENERIC_MEDIA = /^\[(photo|video|image|sticker|gif|media|voice message[^\]]*)\]$/i;
const EDITED_SUFFIX = /\s*·\s*edited\s*$/i;
const REPLY_HEADER = /\breplied to\b/i;

function cleanFrame(items: FrameItem[], labels: Set<string>): FrameItem[] {
  const out: FrameItem[] = [];
  let pendingHeader: string | null = null;
  let pendingLabel: string | null = null;
  for (const raw of items) {
    if (raw.cutOff || !raw.text.trim()) continue;
    const it = { ...raw, senderLabel: raw.senderLabel?.replace(EDITED_SUFFIX, "") || null, replyHeader: raw.replyHeader?.replace(EDITED_SUFFIX, "") || null };
    if (it.senderLabel && REPLY_HEADER.test(it.senderLabel)) {
      it.replyHeader ??= it.senderLabel;
      it.senderLabel = null;
    }
    if (it.type !== "divider" && it.side !== "right" && labels.has(it.text.trim().toLowerCase())) {
      pendingLabel = it.text.trim();
      continue;
    }
    const prefix = /^([^:\n]{1,40}):\s+/.exec(it.text);
    if (prefix && labels.has(prefix[1].trim().toLowerCase())) {
      it.senderLabel ??= prefix[1].trim();
      it.text = it.text.slice(prefix[0].length);
    }
    if (pendingLabel && it.type === "message" && it.side !== "right") it.senderLabel ??= pendingLabel;
    pendingLabel = null;
    if (it.type !== "divider" && REPLY_HEADER.test(it.text) && it.text.length < 60 && !/[?!.]$/.test(it.text)) {
      pendingHeader = it.text.replace(EDITED_SUFFIX, "");
      continue;
    }
    if (pendingHeader && it.type === "message") {
      it.replyHeader ??= pendingHeader;
    }
    pendingHeader = null;
    out.push(it);
  }
  return out.filter((it, k) => {
    const neighbors = [out[k - 1], out[k + 1]].filter(Boolean);
    return !neighbors.some((n) => n.quoted && similarity(n.quoted, it.text) >= 0.9);
  });
}

function place(it: FrameItem, frame: number): Placed {
  const sideVotes = { left: it.side === "left" ? 1 : 0, right: it.side === "right" ? 1 : 0 };
  return { ...it, frames: [frame], sideVotes };
}

function merge(into: Placed, from: FrameItem, frame: number): void {
  into.frames.push(frame);
  if (from.side === "left") into.sideVotes.left++;
  if (from.side === "right") into.sideVotes.right++;
  into.senderLabel ??= from.senderLabel;
  into.replyHeader ??= from.replyHeader;
  into.quoted ??= from.quoted;
  if (from.text.length > into.text.length) into.text = from.text;
  into.reactions = [...new Set([...into.reactions, ...from.reactions])];
}

function align(frame: FrameItem[], global: Placed[], lo: number, hi: number): [number, number][] {
  const n = frame.length;
  const m = hi - lo;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let j = n - 1; j >= 0; j--) {
    for (let k = m - 1; k >= 0; k--) {
      dp[j][k] = sameItem(frame[j], global[lo + k]) ? dp[j + 1][k + 1] + 1 : Math.max(dp[j + 1][k], dp[j][k + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let j = 0;
  let k = 0;
  while (j < n && k < m) {
    if (sameItem(frame[j], global[lo + k]) && dp[j][k] === dp[j + 1][k + 1] + 1) {
      pairs.push([j, lo + k]);
      j++;
      k++;
    } else if (dp[j + 1][k] >= dp[j][k + 1]) j++;
    else k++;
  }
  return pairs;
}

function mergeInto(seq: Placed[], items: FrameItem[], frame: number): void {
  if (!items.length) return;
  const pairs = seq.length ? align(items, seq, 0, seq.length) : [];
  const fresh = (it: FrameItem) => !seq.some((g) => sameItem(g, it));
  if (!pairs.length) {
    seq.push(...items.filter(fresh).map((it) => place(it, frame)));
    return;
  }
  const inserts: { at: number; items: Placed[] }[] = [];
  let prevJ = -1;
  for (const [j, g] of pairs) {
    const gap = items.slice(prevJ + 1, j).filter(fresh).map((it) => place(it, frame));
    if (gap.length) inserts.push({ at: g, items: gap });
    merge(seq[g], items[j], frame);
    prevJ = j;
  }
  const tail = items.slice(prevJ + 1).filter(fresh).map((it) => place(it, frame));
  if (tail.length) inserts.push({ at: pairs[pairs.length - 1][1] + 1, items: tail });
  for (const ins of inserts.sort((a, b) => b.at - a.at)) seq.splice(ins.at, 0, ...ins.items);
}

interface Segment {
  key: string;
  divider: Placed | null;
  seq: Placed[];
}

export function stitchFrames(frames: FrameExtraction[], reference: LocalParts, warnings: string[] = []): Placed[] {
  const segments = new Map<string, Segment>();
  const heads: { before: string; items: FrameItem[]; frame: number }[] = [];
  const keyOf = (divider: FrameItem) => {
    const parts = parseDivider(divider.text, reference);
    return parts ? parts.map((n) => String(n).padStart(4, "0")).join("-") : `?${norm(divider.text)}`;
  };
  const labels = new Set(
    frames.flatMap((f) =>
      f.items
        .map((it) => it.senderLabel?.replace(EDITED_SUFFIX, "").trim().toLowerCase())
        .filter((l): l is string => !!l && !REPLY_HEADER.test(l)),
    ),
  );

  let carry = "";
  for (const f of frames) {
    const items = cleanFrame(f.items, labels);
    let firstKey: string | null = null;
    let current: Segment | null = null;
    let head: FrameItem[] = [];
    let chunk: FrameItem[] = [];
    const flush = () => {
      if (current) mergeInto(current.seq, chunk, f.frame);
      chunk = [];
    };
    for (const it of items) {
      if (it.type !== "divider") {
        (current ? chunk : head).push(it);
        continue;
      }
      flush();
      const key = keyOf(it);
      firstKey ??= key;
      const existing = segments.get(key);
      if (existing) {
        if (existing.divider) merge(existing.divider, it, f.frame);
        current = existing;
      } else {
        current = { key, divider: place(it, f.frame), seq: [] };
        segments.set(key, current);
      }
      if (head.length) {
        heads.push({ before: key, items: head, frame: f.frame });
        head = [];
      }
    }
    flush();
    if (head.length && !current) heads.push({ before: carry, items: head, frame: f.frame });
    carry = firstKey ?? carry;
  }

  const bySupport = [...segments.values()].sort((a, b) => (a.divider?.frames.length ?? 0) - (b.divider?.frames.length ?? 0));
  for (const seg of bySupport) {
    const distinctive = seg.seq.filter((it) => !GENERIC_MEDIA.test(it.text.trim()));
    if (!distinctive.length) continue;
    let best: Segment | null = null;
    let bestShared = 0;
    for (const other of segments.values()) {
      if (other === seg || (other.divider?.frames.length ?? 0) < (seg.divider?.frames.length ?? 0)) continue;
      const shared = distinctive.filter((it) => other.seq.some((g) => sameItem(g, it))).length;
      if (shared > bestShared) [best, bestShared] = [other, shared];
    }
    if (best && bestShared * 2 >= distinctive.length) {
      mergeInto(best.seq, seg.seq, seg.seq[0].frames[0]);
      segments.delete(seg.key);
    }
  }
  const ordered = [...segments.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (ordered.some((s) => s.key.startsWith("?"))) warnings.push("Some date dividers could not be read; their messages may be out of order.");
  const orphan: Segment = { key: "", divider: null, seq: [] };
  for (const h of heads) {
    const idx = ordered.findIndex((s) => s.key === h.before);
    const target = h.before === "" ? (ordered[ordered.length - 1] ?? orphan) : idx > 0 ? ordered[idx - 1] : idx === 0 ? orphan : (ordered[ordered.length - 1] ?? orphan);
    mergeInto(target.seq, h.items, h.frame);
  }
  const all = orphan.seq.length ? [orphan, ...ordered] : ordered;
  const out: Placed[] = all.flatMap((s) => (s.divider ? [s.divider, ...s.seq] : s.seq));
  for (const p of out) {
    if (p.type !== "divider" && p.side !== "center") p.side = p.sideVotes.right > p.sideVotes.left ? "right" : "left";
  }
  return out;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Resolves a chat date divider ("FRI 9:04 P.M.", "Yesterday 9:41 AM", "OCT 30, 11:05 A.M.") to local wall-clock parts. */
export function parseDivider(text: string, reference: LocalParts): LocalParts | null {
  const t = text.toUpperCase().replace(/\./g, "").replace(/\bAT\b/g, " ").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const time = /(\d{1,2}):(\d{2})\s*(AM|PM)?/.exec(t);
  if (!time) return null;
  const hour = to24h(Number(time[1]), time[3]);
  const minute = Number(time[2]);
  const day0 = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  const refDay = day0(reference[0], reference[1] - 1, reference[2]);
  let day: Date | null = null;

  const md = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{1,2})\b(?:\s+(\d{4}))?/.exec(t);
  const wd = /\b(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*\b/.exec(t);
  if (md) {
    const month = monthIndex(md[1]);
    const dayOfMonth = Number(md[2]);
    const year = md[3] ? Number(md[3]) : refDay.getUTCFullYear();
    day = day0(year, month, dayOfMonth);
    if (!md[3] && day > refDay) day = day0(year - 1, month, dayOfMonth);
  } else if (/\bYESTERDAY\b/.test(t)) {
    day = day0(refDay.getUTCFullYear(), refDay.getUTCMonth(), refDay.getUTCDate() - 1);
  } else if (wd) {
    const target = WEEKDAYS.indexOf(wd[1].toLowerCase());
    const back = (refDay.getUTCDay() - target + 7) % 7 || 7;
    day = day0(refDay.getUTCFullYear(), refDay.getUTCMonth(), refDay.getUTCDate() - back);
  } else {
    day = refDay;
  }
  return [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute];
}

function senderFromReplyHeader(header: string | null): { self: boolean; name: string } | null {
  if (!header) return null;
  const m = /^(.+?) replied to /i.exec(header.trim());
  if (!m) return null;
  return /^you$/i.test(m[1]) ? { self: true, name: SELF } : { self: false, name: m[1] };
}

export interface RecordedMessage {
  /** Local wall-clock time from the nearest date divider above it (filled from neighbors when none was visible). */
  local: LocalParts;
  sender: string;
  isSelf: boolean;
  kind: MessageKind;
  text: string;
  meta?: MessageMeta;
}

export interface RecordedChat {
  title: string;
  platform: string | null;
  isGroup: boolean;
  participants: string[];
  messages: RecordedMessage[];
  warnings: string[];
}

const SELF = "Me";

function mediaKind(text: string): string {
  const t = text.toLowerCase();
  if (/reel|post|shared/.test(t)) return "share";
  if (/video/.test(t)) return "video";
  if (/voice|audio/.test(t)) return "audio";
  if (/sticker|gif/.test(t)) return "sticker";
  return "photo";
}

/** Turns the vision model's per-window transcriptions of a scrolling screen recording into one ordered chat. */
export function framesToChat(frames: FrameExtraction[], opts: { recordedAt: LocalParts; selfName?: string | null }): RecordedChat {
  const warnings: string[] = [];
  const self = opts.selfName || SELF;
  const placed = stitchFrames(frames, opts.recordedAt, warnings);
  const title = mostCommon(frames.map((f) => f.chatTitle).filter((t): t is string => !!t)) ?? "Screen recording";
  const platform = mostCommon(frames.map((f) => f.platform?.toLowerCase()).filter((p): p is string => !!p));
  const labelCounts = new Map<string, number>();
  for (const p of placed) if (p.senderLabel) labelCounts.set(p.senderLabel, (labelCounts.get(p.senderLabel) ?? 0) + p.frames.length);
  const canonical = (label: string) => {
    let best = label;
    for (const [other, n] of labelCounts) if (n > (labelCounts.get(best) ?? 0) && similarity(label, other) >= 0.75) best = other;
    return best;
  };
  for (const p of placed) if (p.senderLabel) p.senderLabel = canonical(p.senderLabel);
  const isGroup = placed.some((p) => p.senderLabel);

  const drafts: (Omit<RecordedMessage, "local"> & { local: LocalParts | null })[] = [];
  let local: LocalParts | null = null;
  let runSender: string | null = null;
  for (const p of placed) {
    if (p.type === "divider") {
      const parsed = parseDivider(p.text, opts.recordedAt);
      if (parsed) local = parsed;
      else warnings.push(`Could not read date divider "${p.text}".`);
      runSender = null;
      continue;
    }
    if (p.type === "system" || p.side === "center") {
      drafts.push({ local, sender: "", isSelf: false, kind: "system", text: p.text });
      continue;
    }
    const isSelf = p.side === "right";
    const fromHeader = senderFromReplyHeader(p.replyHeader);
    if (isSelf) runSender = null;
    else if (p.senderLabel) runSender = p.senderLabel;
    else if (fromHeader && !fromHeader.self) runSender = fromHeader.name;
    const sender = isSelf ? self : (runSender ?? (isGroup ? "Unknown" : title));
    const meta: MessageMeta = {};
    let kind: MessageKind = "text";
    if (p.kind === "media" || p.kind === "link") {
      meta.media = [p.kind === "link" ? "share" : mediaKind(p.text)];
      if (p.kind === "media") kind = "media";
    } else if (p.kind === "call") kind = "call";
    else if (p.kind === "unsent") kind = "deleted";
    else if (p.kind === "system") kind = "system";
    if (p.reactions.length) meta.reactions = p.reactions.map((emoji) => ({ sender: "", emoji }));
    drafts.push({ local, sender, isSelf, kind, text: p.text, ...(Object.keys(meta).length ? { meta } : {}) });
  }

  const firstKnown = drafts.find((d) => d.local)?.local ?? null;
  if (!firstKnown && drafts.length) warnings.push("No date dividers were readable; messages are dated to the recording time.");
  const fallback: LocalParts = firstKnown ?? opts.recordedAt;
  const messages = drafts.map((d) => ({ ...d, local: d.local ?? fallback }));
  if (messages.some((m) => m.sender === "Unknown")) warnings.push('Some group messages had no visible sender name; they are attributed to "Unknown".');
  const participants = [...new Set(messages.filter((m) => m.sender).map((m) => m.sender))];
  return { title, platform, isGroup, participants, messages, warnings };
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}
