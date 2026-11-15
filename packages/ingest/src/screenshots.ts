import { buildConversation, localIso, monthIndex, SYSTEM_SENDER, to24h } from "./conversation.ts";
import type { Conversation, DraftMessage, MessageKind } from "./types.ts";

export type Side = "left" | "right" | "center";

export interface FrameItem {
  type: "divider" | "message" | "system";
  side: Side;
  text: string;
  senderLabel: string | null;
  replyHeader: string | null;
  quoted: string | null;
  kind: MessageKind;
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

export function stitchFrames(frames: FrameExtraction[], reference: Date, warnings: string[] = []): Placed[] {
  const segments = new Map<string, Segment>();
  const heads: { before: string; items: FrameItem[]; frame: number }[] = [];
  const keyOf = (divider: FrameItem) => parseDivider(divider.text, reference) ?? `?${norm(divider.text)}`;
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

export function parseDivider(text: string, reference: Date): string | null {
  const t = text.toUpperCase().replace(/\./g, "").replace(/\bAT\b/g, " ").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const time = /(\d{1,2}):(\d{2})\s*(AM|PM)?/.exec(t);
  if (!time) return null;
  const hour = to24h(Number(time[1]), time[3]);
  const minute = Number(time[2]);
  const refDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  let day: Date | null = null;

  const md = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{1,2})\b(?:\s+(\d{4}))?/.exec(t);
  const wd = /\b(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*\b/.exec(t);
  if (md) {
    const month = monthIndex(md[1]);
    const dayOfMonth = Number(md[2]);
    let year = md[3] ? Number(md[3]) : refDay.getFullYear();
    day = new Date(year, month, dayOfMonth);
    if (!md[3] && day > refDay) day = new Date(year - 1, month, dayOfMonth);
  } else if (/\bYESTERDAY\b/.test(t)) {
    day = new Date(refDay.getFullYear(), refDay.getMonth(), refDay.getDate() - 1);
  } else if (wd) {
    const target = WEEKDAYS.indexOf(wd[1].toLowerCase());
    const back = (refDay.getDay() - target + 7) % 7 || 7;
    day = new Date(refDay.getFullYear(), refDay.getMonth(), refDay.getDate() - back);
  } else {
    day = refDay;
  }
  return localIso(day.getFullYear(), day.getMonth() + 1, day.getDate(), hour, minute);
}

function senderFromReplyHeader(header: string | null): { self: boolean; name: string } | null {
  if (!header) return null;
  const m = /^(.+?) replied to /i.exec(header.trim());
  if (!m) return null;
  return /^you$/i.test(m[1]) ? { self: true, name: "Me" } : { self: false, name: m[1] };
}

export function framesToConversation(
  frames: FrameExtraction[],
  opts: { recordedAt?: Date; source?: "instagram" | "screenshots"; title?: string } = {},
): Conversation {
  const warnings: string[] = [];
  const reference = opts.recordedAt ?? new Date();
  const placed = stitchFrames(frames, reference, warnings);
  const titles = frames.map((f) => f.chatTitle).filter((t): t is string => !!t);
  const title = opts.title ?? mostCommon(titles);
  const platforms = frames.map((f) => f.platform?.toLowerCase()).filter(Boolean);
  const source = opts.source ?? (mostCommon(platforms as string[]) === "instagram" ? "instagram" : "screenshots");
  const labelCounts = new Map<string, number>();
  for (const p of placed) if (p.senderLabel) labelCounts.set(p.senderLabel, (labelCounts.get(p.senderLabel) ?? 0) + p.frames.length);
  const canonical = (label: string) => {
    let best = label;
    for (const [other, n] of labelCounts) if (n > (labelCounts.get(best) ?? 0) && similarity(label, other) >= 0.75) best = other;
    return best;
  };
  for (const p of placed) if (p.senderLabel) p.senderLabel = canonical(p.senderLabel);
  const isGroup = placed.some((p) => p.senderLabel);

  const drafts: DraftMessage[] = [];
  let ts: string | null = null;
  let sinceDivider = 0;
  let runSender: string | null = null;
  for (const p of placed) {
    if (p.type === "divider") {
      const parsed = parseDivider(p.text, reference);
      if (parsed) {
        ts = parsed;
        sinceDivider = 0;
      } else {
        warnings.push(`Could not read date divider "${p.text}".`);
      }
      runSender = null;
      continue;
    }
    const sourceRef = `frames ${p.frames[0]}${p.frames.length > 1 ? "-" + p.frames[p.frames.length - 1] : ""}`;
    const tsConfidence = ts ? (sinceDivider === 0 ? "exact" : "inferred") : "none";
    sinceDivider++;
    if (p.type === "system" || p.side === "center") {
      drafts.push({ ts, tsConfidence, sender: SYSTEM_SENDER, isSelf: false, kind: "system", text: p.text, sourceRef });
      continue;
    }
    let sender: string;
    let isSelf = p.side === "right";
    const fromHeader = senderFromReplyHeader(p.replyHeader);
    if (isSelf) {
      sender = "Me";
      runSender = null;
    } else {
      if (p.senderLabel) runSender = p.senderLabel;
      else if (fromHeader && !fromHeader.self) runSender = fromHeader.name;
      sender = runSender ?? (isGroup ? "Unknown" : (title ?? "Them"));
    }
    const draft: DraftMessage = { ts, tsConfidence, sender, isSelf, kind: p.kind, text: p.text, sourceRef };
    if (p.quoted) draft.replyQuote = p.quoted;
    if (p.reactions.length) draft.reactions = p.reactions.map((emoji) => ({ emoji, by: null }));
    drafts.push(draft);
  }

  for (const d of drafts) {
    if (!d.replyQuote) continue;
    let best = -1;
    let bestScore = 0.6;
    for (let k = 0; k < drafts.length && drafts[k] !== d; k++) {
      const s = similarity(drafts[k].text, d.replyQuote);
      if (s >= bestScore) {
        bestScore = s;
        best = k;
      }
    }
    if (best >= 0) d.replyToDraft = best;
  }
  if (drafts.some((d) => d.sender === "Unknown")) {
    warnings.push("Some group messages had no visible sender name; they are attributed to \"Unknown\".");
  }
  return buildConversation(source, title, drafts, warnings);
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}
