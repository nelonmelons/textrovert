import { readJson } from "../archive";
import { streamJsonArray } from "../jsonStream";
import type { ArchiveEntry, ConversationKind, MessageInput, Parser, ParserIO } from "../types";

// messages/c<channel_id>/messages.json (newer packages) or messages/<channel_id>/messages.csv (older ones).
const MESSAGES_RE = /^(.*?(?:^|\/))messages\/c?(\d+)\/messages\.(json|csv)$/;
const CHANNEL_RE = /^(.*?(?:^|\/))messages\/c?(\d+)\/channel\.json$/;
const INDEX_RE = /^(.*?(?:^|\/))messages\/index\.json$/;
const USER_RE = /^(.*?(?:^|\/))account\/user\.json$/;
const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
const DM_LABEL_RE = /^Direct Message with\s+/i;
const DISCORD_EPOCH = 1420070400000n;

interface Channel {
  type?: unknown;
  name?: unknown;
  guild?: { name?: unknown };
}

export const discordParser: Parser = {
  platform: "discord",
  async claim(entries, peek) {
    const messages: ArchiveEntry[] = [];
    for (const entry of entries) {
      const m = MESSAGES_RE.exec(entry.path);
      if (!m) continue;
      const head = (await peek(entry)).replace(/^\ufeff/, "").trimStart();
      const looksRight =
        m[3] === "csv"
          ? /^"?ID"?\s*,\s*"?Timestamp"?/i.test(head)
          : head.startsWith("[") && (/^\[\s*\]/.test(head) || /"Timestamp"/i.test(head));
      if (looksRight) messages.push(entry);
    }
    if (!messages.length) return [];
    const support: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (CHANNEL_RE.test(entry.path) || INDEX_RE.test(entry.path)) support.push(entry);
      else if (USER_RE.test(entry.path) && /"username"/.test(await peek(entry))) support.push(entry);
    }
    return [...support, ...messages];
  },
  async parse(entries, io) {
    // Maps are keyed by the folder in front of "messages/" (or "account/") so several packages in one upload stay apart.
    const selfByRoot = new Map<string, string>();
    const labels = new Map<string, Record<string, unknown>>();
    const channels = new Map<string, Channel>();
    for (const entry of entries) {
      try {
        const user = USER_RE.exec(entry.path);
        const index = INDEX_RE.exec(entry.path);
        const channel = CHANNEL_RE.exec(entry.path);
        if (!user && !index && !channel) continue;
        const json = (await readJson(entry)) as any;
        if (user) {
          const names = [clean(json?.global_name), clean(json?.username)].filter(Boolean);
          if (names.length) io.selfHint(names);
          selfByRoot.set(user[1], names[0] ?? "");
        } else if (index) labels.set(index[1], json ?? {});
        else if (channel) channels.set(channel[1] + channel[2], json ?? {});
      } catch (error) {
        io.warn(entry.path + ": could not read (" + (error as Error).message + ")");
      }
    }
    const anySelf = [...selfByRoot.values()].find(Boolean) ?? "";

    for (const entry of entries) {
      const m = MESSAGES_RE.exec(entry.path);
      if (!m) continue;
      const [, root, channelId, format] = m;
      const self = selfByRoot.get(root) || anySelf || "You";
      const label = clean(labels.get(root)?.[channelId]);
      const channel = channels.get(root + channelId);
      try {
        await parseChannel(entry, channelId, format === "csv", self, label, channel, io);
      } catch (error) {
        io.warn(entry.path + ": skipped (" + (error as Error).message + ")");
      }
    }
  },
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(INVISIBLE_RE, "").trim() : "";
}

// Channel type is a number in newer packages (1 DM, 3 group DM) and a name in some others.
function describeChannel(channel: Channel | undefined, label: string): { kind: ConversationKind; title: string } {
  const type = typeof channel?.type === "string" ? channel.type.toUpperCase() : channel?.type;
  const labelled = label && !/^unknown channel$/i.test(label) ? label : "";
  const isDm = type === 1 || type === "DM" || (type === undefined && DM_LABEL_RE.test(labelled));
  const name = clean(channel?.name);
  const guild = clean(channel?.guild?.name);
  if (isDm) return { kind: "dm", title: labelled.replace(DM_LABEL_RE, "").replace(/#0$/, "") };
  if (type === 3 || type === "GROUP_DM") return { kind: "group", title: name || labelled.replace(DM_LABEL_RE, "").replace(/#0\b/g, "") };
  return { kind: "group", title: labelled || (name && guild ? name + " in " + guild : name) };
}

function attachmentKind(url: string): string {
  const ext = /\.(\w{2,5})(?:[?#]|$)/.exec(url.split("?")[0] + "?")?.[1]?.toLowerCase() ?? "";
  if (/^(png|jpe?g|webp|heic|bmp|avif)$/.test(ext)) return "photo";
  if (ext === "gif") return "gif";
  if (/^(mp4|mov|webm|mkv|m4v|avi)$/.test(ext)) return "video";
  if (/^(mp3|m4a|aac|wav|ogg|opus|flac)$/.test(ext)) return "audio";
  return "file";
}

function timestamp(raw: unknown, id: unknown): number | null {
  if (typeof raw === "string" && raw.trim()) {
    let iso = raw.trim().replace(" ", "T");
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += "Z";
    const ts = Date.parse(iso);
    if (Number.isFinite(ts)) return ts;
  }
  if (typeof id === "string" && /^\d{15,}$/.test(id)) return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
  return null;
}

async function parseChannel(
  entry: ArchiveEntry,
  channelId: string,
  csv: boolean,
  self: string,
  label: string,
  channel: Channel | undefined,
  io: ParserIO,
) {
  const { kind, title } = describeChannel(channel, label);
  io.conversation({ externalId: channelId, title, kind, participants: [self], selfName: self });
  let batch: MessageInput[] = [];
  for await (const row of csv ? csvObjects(entry) : streamJsonArray(entry.open(), [])) {
    const r = row as Record<string, unknown>;
    const ts = timestamp(r.Timestamp, r.ID);
    if (ts === null) continue;
    const text = clean(typeof r.Contents === "string" ? r.Contents.replace(/\r\n?/g, "\n") : r.Contents) || null;
    const urls = (Array.isArray(r.Attachments) ? r.Attachments.map(String) : String(r.Attachments ?? "").split(/\s+/)).filter((u) =>
      /^https?:\/\//i.test(u),
    );
    if (!text && !urls.length) continue;
    const message: MessageInput = { ts, sender: self, kind: urls.length && !text ? "media" : "text", text };
    if (urls.length) message.meta = { media: urls.map(attachmentKind) };
    batch.push(message);
    if (batch.length >= 1000) {
      await io.messages(channelId, batch);
      batch = [];
    }
  }
  if (batch.length) await io.messages(channelId, batch);
}

// RFC 4180 rows (quoted fields, doubled quotes, newlines inside quotes) keyed by the header row.
async function* csvObjects(entry: ArchiveEntry): AsyncGenerator<Record<string, string>> {
  const decoder = new TextDecoder("utf-8");
  let header: string[] | null = null;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteSeen = false;
  let first = true;

  const finish = (): Record<string, string> | null => {
    row.push(field);
    field = "";
    const done = row;
    row = [];
    if (done.length === 1 && done[0] === "") return null;
    if (!header) {
      header = done.map((h) => h.trim().replace(/^\ufeff/, "").toLowerCase());
      return null;
    }
    const out: Record<string, string> = {};
    header.forEach((name, i) => {
      out[name === "id" ? "ID" : name === "timestamp" ? "Timestamp" : name === "contents" ? "Contents" : name === "attachments" ? "Attachments" : name] = done[i] ?? "";
    });
    return out;
  };

  async function* scan(text: string) {
    if (first) {
      text = text.replace(/^\ufeff/, "");
      first = false;
    }
    for (const ch of text) {
      if (inQuotes) {
        if (quoteSeen) {
          if (ch === '"') {
            field += '"';
            quoteSeen = false;
            continue;
          }
          inQuotes = false;
          quoteSeen = false;
        } else if (ch === '"') {
          quoteSeen = true;
          continue;
        } else {
          field += ch;
          continue;
        }
      }
      if (ch === '"' && field === "") inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        const record = finish();
        if (record) yield record;
      } else if (ch !== "\r") field += ch;
    }
  }

  for await (const chunk of entry.open()) yield* scan(decoder.decode(chunk, { stream: true }));
  yield* scan(decoder.decode());
  inQuotes = false;
  if (field !== "" || row.length) {
    const record = finish();
    if (record) yield record;
  }
}
