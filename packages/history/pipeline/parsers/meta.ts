import { readHead, readJson } from "../archive";
import { streamJsonArray } from "../jsonStream";
import { fixMojibake } from "../text";
import type { ArchiveEntry, MessageInput, MessageMeta, Parser, ParserIO, Platform } from "../types";

// .../messages/<inbox|archived_threads|message_requests|...>/<thread_folder>/message_N.json, with or without a
// your_instagram_activity / your_facebook_activity prefix.
const THREAD_RE = /(^|\/)messages\/[^/]+\/[^/]+\/message_\d+\.json$/;
const MESSAGES_DIR_RE = /(?:^|\/)((?:your_(?:instagram|facebook)_activity\/)?messages\/)/;
const IG_PROFILE_RE = /(^|\/)personal_information\/(?:personal_information\/)?personal_information\.json$/;
const FB_PROFILE_RE = /(^|\/)profile_information\/profile_information\.json$/;
const IG_ACTIVITY_RE = /(^|\/)your_instagram_activity\//;
const FB_ACTIVITY_RE = /(^|\/)your_facebook_activity\//;

// Top-level folders only one of the two exports has. They decide the old root-level "messages/" layout, where the
// path itself does not say which platform it is.
const IG_ROOT_RE =
  /^(?:story_sticker_interactions|account_history|autofill_information|login_and_account_creation|connections|likes|saved|media|personal_information\/personal_information)(?:\/|\.json$)/;
const FB_ROOT_RE =
  /^(?:profile_information|posts|friends|friends_and_followers|following_and_followers|comments_and_reactions|facebook_[a-z_]+|groups|pages|photos_and_videos|security_and_login_information|apps_and_websites_off_of_facebook|your_places|ads_information|other_activity|personal_information\/profile_information|messages\/(?:archived_threads|filtered_threads|e2ee_cutover))(?:\/|\.json$)/;
const FB_SNIFF_RE = /"type"\s*:\s*"(?:Generic|Share|Call|Subscribe|Unsubscribe)"|"thread_type"\s*:/;

const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

const UNSENT_RE = /^(?:You|.+?) unsent a message\.?$/i;
const REACTION_RE = /^(?:reacted .+ to (?:your|a|their|his|her|.+?['\u2019]s) message|liked a message)\.?$/i;
const GROUP_EVENT_RE =
  /^(?:named the group|changed the group (?:name|photo)|created (?:the|a) group|joined the group|joined (?:the )?(?:group|chat)|left the group|added .+ to the (?:group|chat)|removed .+ from the (?:group|chat)|set (?:the )?nickname|set .+?['\u2019]s nickname|set (?:his|her|their) own nickname|cleared (?:the )?nickname|changed (?:the )?(?:chat|group) (?:theme|colors?|emoji)|changed the theme|set the emoji|set the quick reaction|pinned a message|unpinned a message|turned (?:on|off) .+|are now connected on Messenger)/i;
const CONNECTED_RE = /^(?:You are now connected on Messenger|Say hi to your new (?:Facebook|Instagram) friend)/i;
const ATTACHMENT_LINE_RE =
  /^sent (an attachment|a link|a photo|\d+ photos|a video|a sticker|a GIF|a voice message|a file)\.?$/i;
const CALL_LINE_RE = /^(?:started a (?:video|audio) (?:chat|call)|ended the (?:video|audio) (?:chat|call))\.?$/i;

export const instagramParser: Parser = metaParser("instagram");
export const messengerParser: Parser = metaParser("messenger");

function metaParser(platform: "instagram" | "messenger"): Parser {
  const isInstagram = platform === "instagram";
  return {
    platform,
    async claim(entries, peek) {
      const claimed: ArchiveEntry[] = [];
      const prefixPlatform = new Map<string, Platform>();
      for (const entry of entries) {
        if (THREAD_RE.test(entry.path)) {
          if ((await platformOf(entry, entries, peek, prefixPlatform)) === platform) claimed.push(entry);
        } else if (isInstagram && IG_PROFILE_RE.test(entry.path)) {
          if ((await peek(entry)).includes("profile_user")) claimed.push(entry);
        } else if (!isInstagram && FB_PROFILE_RE.test(entry.path)) {
          claimed.push(entry);
        } else if (!isInstagram && /\.json$/i.test(entry.path) && entry.size > 0 && (await isE2ee(entry, peek))) {
          claimed.push(entry);
        }
      }
      return claimed;
    },
    async parse(entries, io) {
      const threads = new Map<string, ArchiveEntry[]>();
      for (const entry of entries) {
        if (THREAD_RE.test(entry.path)) {
          const folder = entry.path.slice(0, entry.path.lastIndexOf("/"));
          threads.set(folder, [...(threads.get(folder) ?? []), entry]);
        } else if (IG_PROFILE_RE.test(entry.path)) {
          await readProfile(entry, io, instagramNames);
        } else if (FB_PROFILE_RE.test(entry.path)) {
          await readProfile(entry, io, facebookNames);
        } else {
          await parseE2ee(entry, io);
        }
      }
      for (const [folder, files] of threads) {
        // message_1.json is the newest chunk, so the highest number goes first to keep the stream chronological.
        files.sort((a, b) => chunkNumber(b.path) - chunkNumber(a.path));
        for (const file of files) await parseThreadFile(file, folder.slice(folder.lastIndexOf("/") + 1), io);
      }
    },
  };
}

function chunkNumber(path: string): number {
  return Number(/message_(\d+)\.json$/.exec(path)?.[1] ?? 0);
}

async function platformOf(
  entry: ArchiveEntry,
  entries: ArchiveEntry[],
  peek: (entry: ArchiveEntry) => Promise<string>,
  cache: Map<string, Platform>,
): Promise<Platform> {
  if (IG_ACTIVITY_RE.test(entry.path)) return "instagram";
  if (FB_ACTIVITY_RE.test(entry.path)) return "messenger";
  const dir = MESSAGES_DIR_RE.exec(entry.path)!;
  const prefix = entry.path.slice(0, dir.index + (dir[0].startsWith("/") ? 1 : 0));
  const cached = cache.get(prefix);
  if (cached) return cached;
  let ig = 0;
  let fb = 0;
  for (const other of entries) {
    if (!other.path.startsWith(prefix)) continue;
    const rest = other.path.slice(prefix.length);
    if (IG_ROOT_RE.test(rest)) ig++;
    else if (FB_ROOT_RE.test(rest)) fb++;
  }
  let result: Platform;
  if (ig !== fb) result = ig > fb ? "instagram" : "messenger";
  else if (FB_SNIFF_RE.test(await peek(entry))) result = "messenger";
  else if (/instagram/i.test(entry.path)) result = "instagram";
  else if (/facebook|messenger/i.test(entry.path)) result = "messenger";
  else result = "instagram";
  cache.set(prefix, result);
  return result;
}

// Messenger's end-to-end encrypted chat download: { participants, threadName, messages: [{ senderName, text, timestamp }] }.
async function isE2ee(entry: ArchiveEntry, peek: (entry: ArchiveEntry) => Promise<string>): Promise<boolean> {
  const head = await peek(entry);
  return head.trimStart().startsWith("{") && /"senderName"/.test(head) && /"participants"/.test(head) && /"messages"/.test(head);
}

function clean(value: unknown): string {
  return typeof value === "string" ? fixMojibake(value).replace(INVISIBLE_RE, "").trim() : "";
}

function instagramNames(json: any): string[] {
  const map = json?.profile_user?.[0]?.string_map_data;
  return [map?.Name?.value, map?.Username?.value].map(clean).filter(Boolean);
}

function facebookNames(json: any): string[] {
  const name = json?.profile_v2?.name;
  const composed = [name?.first_name, name?.middle_name, name?.last_name].map(clean).filter(Boolean).join(" ");
  return [clean(name?.full_name), composed].filter(Boolean);
}

async function readProfile(entry: ArchiveEntry, io: ParserIO, namesOf: (json: any) => string[]) {
  try {
    const names = [...new Set(namesOf(await readJson(entry)))];
    if (names.length) io.selfHint(names);
  } catch (error) {
    io.warn(entry.path + ": could not read profile (" + (error as Error).message + ")");
  }
}

function mediaFromUri(uri: unknown): string {
  const ext = /\.(\w{2,5})(?:\?|$)/.exec(typeof uri === "string" ? uri : "")?.[1]?.toLowerCase() ?? "";
  if (/^(jpe?g|png|heic|webp)$/.test(ext)) return "photo";
  if (ext === "gif") return "gif";
  if (/^(mp4|mov|webm|m4v|3gp)$/.test(ext)) return "video";
  if (/^(mp3|m4a|aac|wav|ogg|opus|amr)$/.test(ext)) return "audio";
  return "file";
}

async function parseThreadFile(entry: ArchiveEntry, externalId: string, io: ParserIO) {
  let data: any;
  try {
    data = await readJson(entry);
  } catch (error) {
    io.warn(entry.path + ": skipped, could not read thread (" + (error as Error).message + ")");
    return;
  }
  if (!Array.isArray(data?.messages)) {
    io.warn(entry.path + ": skipped, no messages array");
    return;
  }
  const participants = new Set<string>(
    (Array.isArray(data.participants) ? data.participants : []).map((p: any) => clean(p?.name ?? p)).filter(Boolean),
  );
  const messages: MessageInput[] = [];
  for (const raw of data.messages) {
    const message = convert(raw);
    if (!message) continue;
    if (message.sender) participants.add(message.sender);
    messages.push(message);
  }
  // message_1.json is the newest chunk and lists newest first.
  messages.sort((a, b) => a.ts - b.ts);
  const group = data.thread_type === "RegularGroup" || (data.thread_type !== "Regular" && participants.size > 2);
  io.conversation({
    externalId,
    title: clean(data.title),
    kind: group ? "group" : "dm",
    participants: [...participants],
  });
  for (let i = 0; i < messages.length; i += 1000) await io.messages(externalId, messages.slice(i, i + 1000));
}

// "Alice reacted ..." / "You sent an attachment.": the text after the actor, or null when no actor starts the line.
function stripActor(content: string, sender: string): string | null {
  const lower = content.toLowerCase();
  if (sender && lower.startsWith(sender.toLowerCase() + " ")) return content.slice(sender.length + 1);
  if (lower.startsWith("you ")) return content.slice(4);
  return null;
}

function convert(m: any): MessageInput | null {
  if (!m || typeof m !== "object") return null;
  const rawTs = Number(m.timestamp_ms ?? (m.timestamp !== undefined ? m.timestamp * (m.timestamp < 1e11 ? 1000 : 1) : NaN));
  if (!Number.isFinite(rawTs)) return null;
  const ts = Math.round(rawTs);
  const sender = clean(m.sender_name);
  const content = clean(m.content);
  const stripped = stripActor(content, sender);

  if (m.is_unsent === true || UNSENT_RE.test(content)) return { ts, sender, kind: "deleted", text: null };
  if (m.type === "Subscribe" || m.type === "Unsubscribe") return { ts, sender: "", kind: "system", text: content || null };

  const media: string[] = [];
  const add = (list: unknown, kind: string) => {
    if (Array.isArray(list)) for (let i = 0; i < list.length; i++) media.push(kind);
  };
  add(m.photos, "photo");
  add(m.videos, "video");
  add(m.gifs, "gif");
  add(m.audio_files, "audio");
  add(m.files, "file");
  if (m.sticker) media.push("sticker");
  if (m.share) media.push("share");

  const reactions = (Array.isArray(m.reactions) ? m.reactions : [])
    .map((r: any) => ({ sender: clean(r?.actor), emoji: clean(r?.reaction) }))
    .filter((r: { sender: string; emoji: string }) => r.emoji);
  const meta: MessageMeta = {};
  if (reactions.length) meta.reactions = reactions;
  const withMeta = Object.keys(meta).length ? { meta } : {};

  if (typeof m.call_duration === "number" || m.type === "Call" || (!media.length && stripped !== null && CALL_LINE_RE.test(stripped))) {
    if (typeof m.call_duration === "number" && m.call_duration > 0) meta.durationSec = m.call_duration;
    return { ts, sender, kind: "call", text: null, ...(Object.keys(meta).length ? { meta } : {}) };
  }

  // Activity lines Meta writes into the thread: not something anyone typed, so they become system notices.
  if (!media.length && content) {
    const reacted = REACTION_RE.test(content.replace(/^reacted /i, "reacted ")) || (stripped !== null && REACTION_RE.test(stripped));
    if (reacted || CONNECTED_RE.test(content) || (stripped !== null && GROUP_EVENT_RE.test(stripped))) {
      return { ts, sender: "", kind: "system", text: content };
    }
  }

  // "You sent an attachment." stands in for an attachment Meta no longer has: still a media message.
  const attachmentLine = stripped !== null ? ATTACHMENT_LINE_RE.exec(stripped) : null;
  if (attachmentLine && !media.length) {
    const what = attachmentLine[1].toLowerCase();
    media.push(
      what.includes("photo") ? "photo" : what.includes("video") ? "video" : what.includes("sticker") ? "sticker" : what.includes("gif") ? "gif" : what.includes("voice") ? "audio" : what.includes("link") ? "share" : "file",
    );
  }
  // A shared post or reel often has no typed text; keep its link so it stays searchable and counts as a link.
  const text = (attachmentLine ? null : content || null) ?? (typeof m.share?.link === "string" && m.share.link ? m.share.link : null);

  if (media.length) return { ts, sender, kind: "media", text, meta: { ...meta, media } };
  if (text) return { ts, sender, kind: "text", text, ...withMeta };
  return null;
}

async function parseE2ee(entry: ArchiveEntry, io: ParserIO) {
  const head = await readHead(entry);
  const externalId = "e2ee:" + (entry.path.split("/").pop() ?? entry.path).replace(/\.json$/i, "");
  let title = "";
  try {
    const raw = /"threadName"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(head)?.[1];
    title = raw ? clean(JSON.parse(raw)) : "";
  } catch {
    title = "";
  }
  const participants = new Set<string>();
  try {
    const listed = /"participants"\s*:\s*(\[[^\]]*\])/.exec(head)?.[1];
    for (const p of listed ? JSON.parse(listed) : []) {
      const name = clean(typeof p === "string" ? p : p?.name);
      if (name) participants.add(name);
    }
  } catch {
    // The 4 KB head can cut the list off; senders fill it in below.
  }
  const declare = () =>
    io.conversation({ externalId, title, kind: participants.size > 2 ? "group" : "dm", participants: [...participants] });
  declare();
  let batch: MessageInput[] = [];
  try {
    for await (const raw of streamJsonArray(entry.open(), ["messages"])) {
      const m = raw as any;
      const ts = Number(m.timestamp);
      if (!Number.isFinite(ts)) continue;
      const sender = clean(m.senderName);
      if (sender) participants.add(sender);
      const text = clean(m.text) || null;
      const media = (Array.isArray(m.media) ? m.media : []).map((x: any) => mediaFromUri(x?.uri ?? x?.url));
      const reactions = (Array.isArray(m.reactions) ? m.reactions : [])
        .map((r: any) => ({ sender: clean(r?.actor ?? r?.senderName), emoji: clean(r?.reaction ?? r?.emoji) }))
        .filter((r: { sender: string; emoji: string }) => r.emoji);
      const meta: MessageMeta = {};
      if (reactions.length) meta.reactions = reactions;
      if (m.isEdited === true) meta.edited = true;
      let message: MessageInput;
      if (m.isUnsent === true) message = { ts, sender, kind: "deleted", text: null };
      else if (/call/i.test(String(m.type ?? ""))) message = { ts, sender, kind: "call", text: null };
      else if (media.length) message = { ts, sender, kind: "media", text, meta: { ...meta, media } };
      else if (text) message = { ts, sender, kind: "text", text };
      else continue;
      if (message.kind !== "media" && Object.keys(meta).length) message.meta = meta;
      batch.push(message);
      if (batch.length >= 1000) {
        declare();
        await io.messages(externalId, batch);
        batch = [];
      }
    }
  } catch (error) {
    io.warn(entry.path + ": stopped reading encrypted chat (" + (error as Error).message + ")");
  }
  declare();
  if (batch.length) await io.messages(externalId, batch);
}
