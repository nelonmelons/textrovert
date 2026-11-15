import { buildConversation, localIso, monthIndex, SYSTEM_SENDER, to24h } from "./conversation.ts";
import type { Conversation, DraftMessage, MessageKind } from "./types.ts";

const INVISIBLE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const NBSP = /[\u00a0\u202f]/g;

const IOS_LINE = /^\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]\s(.*)$/;
const ANDROID_LINE = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\s[-–]\s(.*)$/;
const MD_DAY = /^##\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*$/;
const MD_LINE = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\]\s+\*\*(.+?):\*\*\s?(.*)$/;

const SELF_NAMES = new Set(["you", "me"]);

interface RawEntry {
  a: number;
  b: number;
  c: number;
  hour: number;
  minute: number;
  second: number;
  rest: string;
  lineNo: number;
  body: string[];
}

function classify(text: string): { kind: MessageKind; text: string; edited: boolean } {
  let t = text;
  let edited = false;
  if (/<This message was edited>\s*$/.test(t)) {
    edited = true;
    t = t.replace(/\s*<This message was edited>\s*$/, "");
  }
  if (/^(This message was deleted\.?|You deleted this message\.?)$/i.test(t)) return { kind: "unsent", text: "[deleted message]", edited };
  if (/^<Media omitted>$|^(image|video|audio|sticker|GIF|document) omitted$|^<attached: .+>$/i.test(t)) {
    return { kind: "media", text: `[${t.replace(/[<>]/g, "")}]`, edited };
  }
  if (/^(Missed )?(voice|video) call/i.test(t)) return { kind: "call", text: t, edited };
  if (/^https?:\/\/\S+$/.test(t)) return { kind: "link", text: t, edited };
  return { kind: "text", text: t, edited };
}

function resolveDateOrder(entries: RawEntry[], warnings: string[]): (e: RawEntry) => [number, number, number] {
  if (entries.some((e) => e.a > 31)) return (e) => [e.a, e.b, e.c];
  const firstOver12 = entries.some((e) => e.a > 12);
  const secondOver12 = entries.some((e) => e.b > 12);
  const year = (y: number) => (y < 100 ? 2000 + y : y);
  if (firstOver12 && !secondOver12) return (e) => [year(e.c), e.b, e.a];
  if (!firstOver12 && !secondOver12 && entries.length) {
    warnings.push("Day/month order is ambiguous in this export; assumed month/day/year.");
  }
  return (e) => [year(e.c), e.a, e.b];
}

function parseExportLines(lines: string[], selfName: string | undefined, warnings: string[]): DraftMessage[] {
  const entries: RawEntry[] = [];
  const meridiems: (string | undefined)[] = [];
  lines.forEach((line, idx) => {
    const m = IOS_LINE.exec(line) ?? ANDROID_LINE.exec(line);
    if (!m) {
      if (entries.length) entries[entries.length - 1].body.push(line);
      return;
    }
    entries.push({
      a: Number(m[1]),
      b: Number(m[2]),
      c: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6] ?? 0),
      rest: m[8],
      lineNo: idx + 1,
      body: [],
    });
    meridiems.push(m[7]?.replace(/[.\s]/g, ""));
  });

  const ymd = resolveDateOrder(entries, warnings);
  return entries.map((e, k) => {
    const [y, mo, d] = ymd(e);
    const ts = localIso(y, mo, d, to24h(e.hour, meridiems[k]), e.minute, e.second);
    const senderMatch = /^([^:]{1,80}?): ([\s\S]*)$/.exec(e.rest) ?? /^([^:]{1,80}?):$/.exec(e.rest);
    const firstLine = senderMatch ? (senderMatch[2] ?? "") : e.rest;
    const fullText = [firstLine, ...e.body].join("\n").replace(/\n+$/, "").trim();
    if (!senderMatch) {
      return { ts, tsConfidence: "exact", sender: SYSTEM_SENDER, isSelf: false, kind: "system", text: fullText, sourceRef: `line ${e.lineNo}` };
    }
    const sender = senderMatch[1].trim();
    const isSelf = selfName ? sender.toLowerCase() === selfName.toLowerCase() : SELF_NAMES.has(sender.toLowerCase());
    const c = classify(fullText);
    const draft: DraftMessage = { ts, tsConfidence: "exact", sender, isSelf, kind: c.kind, text: c.text, sourceRef: `line ${e.lineNo}` };
    if (c.edited) draft.edited = true;
    return draft;
  });
}

function parseMarkdownLines(lines: string[], selfName: string | undefined): DraftMessage[] {
  const drafts: DraftMessage[] = [];
  let day: [number, number, number] | null = null;
  lines.forEach((line, idx) => {
    const dm = MD_DAY.exec(line);
    if (dm) {
      day = [Number(dm[3]), monthIndex(dm[1]) + 1, Number(dm[2])];
      return;
    }
    const m = MD_LINE.exec(line);
    if (m && day) {
      const sender = m[5].trim();
      const isSelf = selfName ? sender.toLowerCase() === selfName.toLowerCase() : SELF_NAMES.has(sender.toLowerCase());
      drafts.push({
        ts: localIso(day[0], day[1], day[2], to24h(Number(m[1]), m[4]), Number(m[2]), Number(m[3] ?? 0)),
        tsConfidence: "exact",
        sender,
        isSelf,
        kind: "text",
        text: m[6],
        sourceRef: `line ${idx + 1}`,
      });
      return;
    }
    if (line.trim() === "---" || !drafts.length) return;
    drafts[drafts.length - 1].text += "\n" + line;
  });
  for (const d of drafts) {
    const c = classify(d.text.replace(/\n+$/, "").trim());
    d.text = c.text;
    d.kind = c.kind;
    if (c.edited) d.edited = true;
  }
  return drafts;
}

export function parseWhatsApp(raw: string, opts: { selfName?: string; title?: string } = {}): Conversation {
  const warnings: string[] = [];
  const lines = raw.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(NBSP, " ").split("\n");
  const isMarkdown = lines.some((l) => MD_DAY.test(l)) && lines.some((l) => MD_LINE.test(l));
  const drafts = isMarkdown ? parseMarkdownLines(lines, opts.selfName) : parseExportLines(lines, opts.selfName, warnings);
  const encryptionNotice = drafts.findIndex((d) => /end-to-end encrypted/i.test(d.text) && d.kind === "system");
  if (encryptionNotice >= 0) drafts.splice(encryptionNotice, 1);
  if (!drafts.length) warnings.push("No WhatsApp messages recognized in this file.");
  if (!drafts.some((d) => d.isSelf)) warnings.push("Could not tell which participant is you; ask the user and call reassignSelf().");
  const titleFromMd = /^# WhatsApp Chat Export:\s*(.+)$/m.exec(raw)?.[1]?.trim();
  return buildConversation("whatsapp", opts.title ?? titleFromMd ?? null, drafts, warnings);
}

export function looksLikeWhatsApp(raw: string): boolean {
  const head = raw.replace(INVISIBLE, "").replace(NBSP, " ").split(/\r?\n/).slice(0, 30);
  return head.some((l) => IOS_LINE.test(l) || ANDROID_LINE.test(l) || MD_LINE.test(l)) || /WhatsApp Chat Export/.test(raw.slice(0, 200));
}
