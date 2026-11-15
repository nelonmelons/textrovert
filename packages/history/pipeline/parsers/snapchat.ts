import { readJson } from "../archive";
import type { ArchiveEntry, MessageInput, Parser, ParserIO } from "../types";

const CHAT_RE = /(^|\/)json\/chat_history\.json$/;
const FRIENDS_RE = /(^|\/)json\/friends\.json$/;
const ACCOUNT_RE = /(^|\/)json\/account\.json$/;
const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
const UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const CREATED_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const OLD_FORMAT_RE = /^(Received|Sent) Saved Chat History$/;

export const snapchatParser: Parser = {
  platform: "snapchat",
  async claim(entries, peek) {
    const chats: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!CHAT_RE.test(entry.path)) continue;
      const head = (await peek(entry)).trim();
      if (head.startsWith("{") && (/^\{\s*\}$/.test(head) || /"\s*:\s*\[/.test(head))) chats.push(entry);
    }
    if (!chats.length) return [];
    const identity: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (FRIENDS_RE.test(entry.path)) identity.push(entry);
      else if (ACCOUNT_RE.test(entry.path) && (await peek(entry)).includes("Basic Information")) identity.push(entry);
    }
    return [...identity, ...chats];
  },
  async parse(entries, io) {
    const displayNames = new Map<string, string>();
    let self: string | null = null;
    for (const entry of entries.filter((e) => !CHAT_RE.test(e.path))) {
      try {
        const json = (await readJson(entry)) as any;
        if (ACCOUNT_RE.test(entry.path)) {
          const info = json?.["Basic Information"];
          const names = [clean(info?.Username), clean(info?.Name)].filter(Boolean);
          if (names.length) io.selfHint(names);
          self = clean(info?.Username) || self;
        } else {
          readFriends(json, displayNames);
        }
      } catch (error) {
        io.warn(entry.path + ": could not read (" + (error as Error).message + ")");
      }
    }
    for (const entry of entries.filter((e) => CHAT_RE.test(e.path))) await parseChatHistory(entry, io, displayNames, self);
  },
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(INVISIBLE_RE, "").trim() : "";
}

// Snapchat's friends.json: { "Friends": [{ Username, "Display Name", ... }], "Deleted Friends": [...], ... }.
// A plain { username: displayName } map is accepted too.
function readFriends(json: any, out: Map<string, string>) {
  if (!json || typeof json !== "object") return;
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === "string") {
      if (clean(value)) out.set(key, clean(value));
    } else if (Array.isArray(value)) {
      for (const friend of value as any[]) {
        const username = clean(friend?.Username);
        const display = clean(friend?.["Display Name"]);
        if (username && display && !out.has(username)) out.set(username, display);
      }
    }
  }
}

function created(entry: any): number | null {
  const micros = Number(entry?.["Created(microseconds)"]);
  if (Number.isFinite(micros) && micros > 1e14) return Math.floor(micros / 1000);
  const m = CREATED_RE.exec(typeof entry?.Created === "string" ? entry.Created : "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

// "TEXT" | "MEDIA" | "IMAGE" | "VIDEO" | "NOTE" | "STICKER" | "SHARE" | "LOCATION" | "STATUS..." | "CALL..."
function convert(entry: any, sender: string, defaultKind: "text" | "media"): MessageInput | null {
  const ts = created(entry);
  if (ts === null) return null;
  const type = clean(entry["Media Type"]).toUpperCase();
  const content = clean(entry.Content) || null;
  if (/^(?:STATUSCALL|CALL)/.test(type)) return { ts, sender, kind: "call", text: null };
  if (type.startsWith("STATUS")) return { ts, sender: "", kind: "system", text: content };
  if (type === "TEXT" || (!type && defaultKind === "text")) return content ? { ts, sender, kind: "text", text: content } : null;
  const media =
    type === "IMAGE" ? "photo"
    : type === "VIDEO" ? "video"
    : type === "NOTE" || type === "AUDIO" ? "audio"
    : type === "STICKER" ? "sticker"
    : type === "SHARE" ? "share"
    : type === "LOCATION" ? "location"
    : type === "MEDIA" || !type ? "media"
    : type.toLowerCase();
  return { ts, sender, kind: "media", text: content, meta: { media: [media] } };
}

async function send(io: ParserIO, externalId: string, messages: MessageInput[]) {
  messages.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < messages.length; i += 1000) await io.messages(externalId, messages.slice(i, i + 1000));
}

async function parseChatHistory(entry: ArchiveEntry, io: ParserIO, displayNames: Map<string, string>, account: string | null) {
  try {
    for await (const [key, value] of topLevelEntries(entry)) {
      if (!Array.isArray(value)) continue;
      const old = OLD_FORMAT_RE.exec(key);
      if (old) await parseOldFormat(old[1] === "Sent", value, io, account);
      else await parseConversation(key, value, io, displayNames, account);
    }
  } catch (error) {
    io.warn(entry.path + ": stopped reading chat history (" + (error as Error).message + ")");
  }
}

async function parseConversation(key: string, rows: any[], io: ParserIO, displayNames: Map<string, string>, account: string | null) {
  const externalId = clean(key) || key;
  const senders = new Set<string>();
  let self: string | null = null;
  let groupTitle = "";
  const messages: MessageInput[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const from = clean(row.From);
    const isSender = row.IsSender ?? row.isSender;
    if (isSender === true && from) self ??= from;
    groupTitle ||= clean(row["Conversation Title"]);
    const message = convert(row, from, "text");
    if (!message) continue;
    if (message.sender) senders.add(message.sender);
    messages.push(message);
  }
  if (!messages.length) return;
  self ??= account;
  const group = !!groupTitle || UUID_RE.test(externalId) || senders.size > 2;
  const participants = new Set(senders);
  if (self) participants.add(self);
  if (!group) participants.add(externalId);
  io.conversation({
    externalId,
    title: group ? groupTitle : displayNames.get(externalId) ?? externalId,
    kind: group ? "group" : "dm",
    participants: [...participants],
    selfName: self,
  });
  await send(io, externalId, messages);
}

// Older exports: "Received Saved Chat History": [{ From, ... }] and "Sent Saved Chat History": [{ To, ... }].
async function parseOldFormat(sent: boolean, rows: any[], io: ParserIO, account: string | null) {
  const self = account ?? "Me";
  const byFriend = new Map<string, MessageInput[]>();
  for (const row of rows) {
    const friend = clean(sent ? row?.To : row?.From);
    if (!friend) continue;
    const message = convert(row, sent ? self : friend, "text");
    if (!message) continue;
    byFriend.set(friend, [...(byFriend.get(friend) ?? []), message]);
  }
  for (const [friend, messages] of byFriend) {
    io.conversation({ externalId: friend, title: friend, kind: "dm", participants: [friend, self], selfName: self });
    await send(io, friend, messages);
  }
}

// chat_history.json is an object keyed by conversation. Yields one [key, array] at a time so a large file is never
// parsed in one piece.
async function* topLevelEntries(entry: ArchiveEntry): AsyncGenerator<[string, unknown]> {
  const decoder = new TextDecoder("utf-8");
  let depth = 0;
  let inString = false;
  let escaped = false;
  let readingKey = false;
  let capturing = false;
  let key: string | null = null;
  let keyParts: string[] = [];
  let valueParts: string[] = [];

  const feed = (text: string, out: [string, unknown][]) => {
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') {
          inString = false;
          if (readingKey) {
            keyParts.push(text.slice(start, i));
            key = JSON.parse('"' + keyParts.join("") + '"');
            keyParts = [];
            readingKey = false;
          }
        }
      } else if (c === '"') {
        inString = true;
        if (depth === 1 && key === null && !capturing) {
          readingKey = true;
          start = i + 1;
        }
      } else if (c === "{" || c === "[") {
        if (depth === 1 && key !== null && !capturing) {
          capturing = true;
          start = i;
        }
        depth++;
      } else if (c === "}" || c === "]") {
        depth--;
        if (capturing && depth === 1) {
          valueParts.push(text.slice(start, i + 1));
          out.push([key!, JSON.parse(valueParts.join(""))]);
          capturing = false;
          valueParts = [];
          key = null;
        }
      } else if (c === "," && depth === 1 && !capturing) {
        key = null;
      }
    }
    if (capturing) valueParts.push(text.slice(start));
    if (readingKey) keyParts.push(text.slice(start));
  };

  for await (const chunk of entry.open()) {
    const out: [string, unknown][] = [];
    feed(decoder.decode(chunk, { stream: true }), out);
    yield* out;
  }
  const out: [string, unknown][] = [];
  feed(decoder.decode(), out);
  yield* out;
}
