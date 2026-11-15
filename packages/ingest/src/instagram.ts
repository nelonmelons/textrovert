import { unzipSync, strFromU8 } from "fflate";
import { buildConversation, SYSTEM_SENDER } from "./conversation.ts";
import type { Conversation, DraftMessage, Reaction } from "./types.ts";

interface IgMessage {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  reactions?: { reaction: string; actor: string }[];
  share?: { link?: string; share_text?: string; original_content_owner?: string };
  photos?: unknown[];
  videos?: unknown[];
  audio_files?: unknown[];
  gifs?: unknown[];
  sticker?: unknown;
  call_duration?: number;
  is_unsent?: boolean;
}

interface IgThreadFile {
  participants: { name: string }[];
  messages: IgMessage[];
  title?: string;
  thread_path?: string;
}

export function fixMojibake(s: string): string {
  if (!/[\u0080-\u00ff]/.test(s) || /[^\u0000-\u00ff]/.test(s)) return s;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

function localIsoFromMs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function toDraft(m: IgMessage, selfName: string | null): DraftMessage {
  const sender = fixMojibake(m.sender_name);
  const content = m.content ? fixMojibake(m.content) : "";
  const base = { ts: localIsoFromMs(m.timestamp_ms), tsConfidence: "exact" as const, sender, isSelf: sender === selfName, sourceRef: `ts ${m.timestamp_ms}` };
  let draft: DraftMessage;
  if (m.is_unsent) draft = { ...base, kind: "unsent", text: "[unsent message]" };
  else if (m.call_duration !== undefined) draft = { ...base, kind: "call", text: `[call, ${Math.round(m.call_duration / 60)} min]` };
  else if (m.share) {
    const owner = m.share.original_content_owner ? ` by @${fixMojibake(m.share.original_content_owner)}` : "";
    const caption = m.share.share_text ? `: ${fixMojibake(m.share.share_text).slice(0, 140)}` : "";
    const note = content && !/sent an attachment/i.test(content) ? `${content} ` : "";
    draft = { ...base, kind: "link", text: `${note}[shared ${/\/reel/.test(m.share.link ?? "") ? "reel" : "post"}${owner}${caption}]`.trim() };
  } else if (m.photos?.length) draft = { ...base, kind: "media", text: `[${m.photos.length > 1 ? `${m.photos.length} photos` : "photo"}]` };
  else if (m.videos?.length) draft = { ...base, kind: "media", text: "[video]" };
  else if (m.audio_files?.length) draft = { ...base, kind: "media", text: "[voice message]" };
  else if (m.gifs?.length || m.sticker) draft = { ...base, kind: "media", text: "[sticker]" };
  else if (/^(Liked a message|Reacted .+ to your message)$/.test(content)) draft = { ...base, kind: "system", text: content };
  else draft = { ...base, kind: /^https?:\/\/\S+$/.test(content) ? "link" : "text", text: content };
  if (m.reactions?.length) {
    draft.reactions = m.reactions.map((r): Reaction => ({ emoji: fixMojibake(r.reaction), by: fixMojibake(r.actor) }));
  }
  return draft;
}

export function parseInstagramThread(files: IgThreadFile[], selfName: string | null): Conversation {
  const first = files[0];
  const messages = files.flatMap((f) => f.messages).sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const drafts = messages.filter((m) => m.sender_name).map((m) => toDraft(m, selfName));
  const warnings = selfName ? [] : ["Could not tell which participant is you; ask the user and call reassignSelf()."];
  const participants = first.participants.map((p) => fixMojibake(p.name));
  const conv = buildConversation("instagram", first.title ? fixMojibake(first.title) : null, drafts, warnings);
  conv.isGroup = participants.length > 2;
  conv.sourceId = first.thread_path ?? null;
  return conv;
}

export function looksLikeInstagramExport(names: string[]): boolean {
  return names.some((n) => /(^|\/)messages\/(inbox|message_requests)\/[^/]+\/message_\d+\.json$/.test(n));
}

export function ingestInstagramExport(bytes: Uint8Array, opts: { selfName?: string; includeRequests?: boolean } = {}): Conversation[] {
  const pattern = opts.includeRequests ? /(^|\/)messages\/(inbox|message_requests)\/([^/]+)\/message_\d+\.json$/ : /(^|\/)messages\/(inbox)\/([^/]+)\/message_\d+\.json$/;
  const entries = unzipSync(bytes, { filter: (f) => pattern.test(f.name) });
  const threads = new Map<string, IgThreadFile[]>();
  for (const [name, data] of Object.entries(entries)) {
    const key = pattern.exec(name)![3];
    const list = threads.get(key) ?? [];
    list.push(JSON.parse(strFromU8(data)) as IgThreadFile);
    threads.set(key, list);
  }
  if (!threads.size) throw new Error("No Instagram message threads found. Export Messages in JSON format.");

  let selfName = opts.selfName ?? null;
  if (!selfName) {
    const counts = new Map<string, number>();
    for (const files of threads.values()) {
      for (const p of new Set(files[0].participants.map((x) => fixMojibake(x.name)))) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length && threads.size > 1 && ranked[0][1] === threads.size && (ranked[1]?.[1] ?? 0) < threads.size) selfName = ranked[0][0];
  }
  return [...threads.values()].map((files) => parseInstagramThread(files, selfName));
}
