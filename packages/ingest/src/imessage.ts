import { buildConversation, localIso, monthIndex, SYSTEM_SENDER, to24h } from "./conversation.ts";
import type { Conversation, DraftMessage, MessageKind, Reaction } from "./types.ts";

const TS = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s?([AP]M)(.*)$/;
const READ = /^\s*\(Read by (.+?) after (.+)\)\s*$/;
const TAPBACK_EMOJI: Record<string, string> = {
  Loved: "❤️",
  Liked: "👍",
  Disliked: "👎",
  Laughed: "😂",
  Emphasized: "‼️",
  Questioned: "❓",
};
const SELF = "Me";

function parseTs(m: RegExpExecArray): string {
  return localIso(Number(m[3]), monthIndex(m[1]) + 1, Number(m[2]), to24h(Number(m[4]), m[7]), Number(m[5]), Number(m[6]));
}

function indentOf(line: string): number {
  return /^ */.exec(line)![0].length;
}

function classify(lines: string[]): { kind: MessageKind; text: string } {
  const text = lines.join("\n").trim();
  if (/^This message was deleted from the conversation!/.test(text)) return { kind: "unsent", text };
  if (/unsent this message part/.test(text)) return { kind: "unsent", text: "[unsent message]" };
  if (/^(FaceTime|SharePlay Message)\n/.test(text)) return { kind: "call", text: text.replace("\n", ": ") };
  const mediaLine = /^((\/|~\/|[A-Za-z]:\\)\S.*|Attachment missing.*|\S+\.(heic|jpe?g|png|gif|mov|mp4|caf|m4a|pdf|webp|docx?|pages))$/i;
  const isMedia = (l: string) => mediaLine.test(l.trim());
  if (lines.some(isMedia)) {
    const names = lines.filter(isMedia).map((l) => l.trim().split(/[\\/]/).pop());
    const rest = lines.filter((l) => !isMedia(l)).join("\n").trim();
    const tag = `[attachment: ${names.join(", ")}]`;
    return rest ? { kind: "text", text: `${tag} ${rest}` } : { kind: "media", text: tag };
  }
  if (/^https?:\/\/\S+$/.test(text)) return { kind: "link", text };
  return { kind: "text", text };
}

export function parseIMessage(raw: string, opts: { title?: string } = {}): Conversation {
  const warnings: string[] = [];
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const drafts: DraftMessage[] = [];
  let lastTopLevel: number | undefined;
  const threadReplies = new Map<string, number>();
  let i = 0;

  const isStart = (k: number) => {
    const line = lines[k]?.trimStart() ?? "";
    const m = TS.exec(line);
    if (!m) return false;
    const tail = m[8];
    if (tail.trim() && !READ.test(tail)) return true;
    const next = lines[k + 1];
    return next !== undefined && next.trim() !== "" && indentOf(next) === indentOf(lines[k]);
  };

  while (i < lines.length) {
    if (!isStart(i)) {
      i++;
      continue;
    }
    const indent = indentOf(lines[i]);
    const m = TS.exec(lines[i].trimStart())!;
    const ts = parseTs(m);
    const tail = m[8];
    const sourceRef = `line ${i + 1}`;

    if (tail.trim() && !READ.test(tail)) {
      drafts.push({ ts, tsConfidence: "exact", sender: SYSTEM_SENDER, isSelf: false, kind: "system", text: tail.trim(), sourceRef });
      i++;
      continue;
    }

    const sender = lines[i + 1].trim();
    const body: string[] = [];
    const reactions: Reaction[] = [];
    let isReply = false;
    let k = i + 2;
    for (; k < lines.length; k++) {
      if (isStart(k)) break;
      const line = lines[k];
      const t = line.trim();
      if (t === "Tapbacks:") {
        while (k + 1 < lines.length && lines[k + 1].trim() && indentOf(lines[k + 1]) > indentOf(line)) {
          k++;
          const tb = /^(.+?) (?:by|from) (.+?)(?::.*)?$/.exec(lines[k].trim());
          if (!tb) continue;
          reactions.push({ emoji: TAPBACK_EMOJI[tb[1]] ?? tb[1], by: tb[2] });
        }
        continue;
      }
      if (t === "This message responded to an earlier message.") {
        isReply = true;
        continue;
      }
      body.push(line.slice(Math.min(indent, indentOf(line))));
    }
    while (body.length && !body[body.length - 1].trim()) body.pop();

    const c = classify(body);
    const draft: DraftMessage = {
      ts,
      tsConfidence: "exact",
      sender: sender === SELF ? "Me" : sender,
      isSelf: sender === SELF,
      kind: c.kind,
      text: c.text,
      sourceRef,
    };
    const read = READ.exec(tail);
    if (read) draft.readAfter = read[2];
    if (reactions.length) draft.reactions = reactions;
    if (/^Edited /m.test(c.text) || /\(edited\)/i.test(c.text)) draft.edited = true;
    const key = `${ts}|${draft.sender}|${c.text}`;
    if (indent > 0) {
      if (lastTopLevel !== undefined) threadReplies.set(key, lastTopLevel);
      i = k;
      continue;
    }
    const parent = threadReplies.get(key);
    if (parent !== undefined) {
      draft.replyToDraft = parent;
      draft.replyQuote = drafts[parent].text.slice(0, 120);
    } else if (isReply) {
      warnings.push(`Message at ${sourceRef} replies to a message outside this export.`);
    }
    drafts.push(draft);
    lastTopLevel = drafts.length - 1;
    i = k;
  }

  if (!drafts.length) warnings.push("No iMessage messages recognized; expected imessage-exporter -f txt output.");
  return buildConversation("imessage", opts.title ?? null, chronological(drafts), warnings);
}

function chronological(drafts: DraftMessage[]): DraftMessage[] {
  const order = drafts.map((_, k) => k).sort((a, b) => (drafts[a].ts ?? "").localeCompare(drafts[b].ts ?? "") || a - b);
  const newIndex = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  return order.map((oldIdx) => {
    const d = drafts[oldIdx];
    return d.replyToDraft === undefined ? d : { ...d, replyToDraft: newIndex.get(d.replyToDraft)! };
  });
}

export function looksLikeIMessage(raw: string): boolean {
  const lines = raw.split(/\r?\n/).slice(0, 40);
  return lines.some((l, k) => TS.test(l.trimStart()) && !!lines[k + 1]?.trim());
}
