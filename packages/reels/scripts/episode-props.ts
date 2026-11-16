/**
 * Builds reel props for one episode (or several consecutive episodes of the same chat) from the local libSQL store.
 *
 *   pnpm props 1652                       one episode by id
 *   pnpm props 1652,1654,1657             merge episodes of one chat into one reel
 *   pnpm props --search "china trip"      best title match (add --chat "LA" to narrow, --list to only print matches)
 *
 * Options: --mood to override the episode mood, --photos a.jpg,b.jpg (URLs or paths under public/), --no-llm,
 * --db/--refs/--env (or REELS_DB/REELS_REFS/REELS_ENV) to point at the local store, --out for the JSON path.
 *
 * Messages are trimmed to the 20-35 that carry the moment and 1-2 highlight quotes are picked by gpt-5-mini; every id
 * it returns is checked against the episode. Output goes to .data/<ids>.json (git-ignored, it holds real chat text).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createClient, type Row } from "@libsql/client";

import { assignColors } from "../src/colors";
import { MAX_PLANS } from "../src/timeline";
import { MOODS, PLATFORMS, type MediaKind, type ReelMessage, type ReelMood, type ReelPlan, type ReelPlatform, type ReelProps } from "../src/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    search: { type: "string" },
    chat: { type: "string" },
    list: { type: "boolean", default: false },
    db: { type: "string", default: process.env.REELS_DB ?? join(root, "../history/.data/ig.db") },
    refs: { type: "string", default: process.env.REELS_REFS ?? join(root, "../history/.data/ig-refs.json") },
    env: { type: "string", default: process.env.REELS_ENV ?? join(root, "../ingest/.env") },
    owner: { type: "string", default: "local-ig" },
    tz: { type: "string", default: "America/Los_Angeles" },
    photos: { type: "string" },
    mood: { type: "string" },
    out: { type: "string" },
    "no-llm": { type: "boolean", default: false },
  },
});

const MIN_KEEP = 20;
const MAX_KEEP = 35;
const PROMPT_MAX_CHARS = 24_000;
const QUOTE_MIN_CHARS = 12;
const QUOTE_MAX_CHARS = 110;

interface ConversationRef {
  key: string;
  title: string;
  platform: string;
  kind: string;
  selfName: string | null;
}

interface EpisodeRow {
  id: number;
  conversation: string;
  startTs: number;
  endTs: number;
  messageCount: number;
  title: string;
  summary: string;
  mood: string;
  plans: { what: string; date: string | null; when: string; sources: number[] }[];
}

const client = createClient({ url: "file:" + values.db });
const refs = JSON.parse(readFileSync(values.refs, "utf8")) as ConversationRef[];
const owner = values.owner;

const toEpisode = (r: Row): EpisodeRow => ({
  id: Number(r.id),
  conversation: String(r.conversation),
  startTs: Number(r.start_ts),
  endTs: Number(r.end_ts),
  messageCount: Number(r.message_count),
  title: String(r.title),
  summary: String(r.summary),
  mood: String(r.mood),
  plans: JSON.parse(String(r.plans)),
});
const EPISODE_COLUMNS = "id, conversation, start_ts, end_ts, message_count, title, summary, mood, plans";

let ids = (positionals[0] ?? "").split(",").filter(Boolean).map(Number);
if (values.search) {
  const chats = values.chat ? refs.filter((c) => c.title.toLowerCase().includes(values.chat!.toLowerCase())).map((c) => c.key) : [];
  const words = values.search.toLowerCase().split(/\s+/).filter(Boolean);
  const result = await client.execute({
    sql:
      `SELECT ${EPISODE_COLUMNS} FROM episodes WHERE owner = ?` +
      (chats.length ? ` AND conversation IN (${chats.map(() => "?").join(",")})` : "") +
      words.map(() => " AND lower(title || ' ' || summary || ' ' || topics) LIKE ?").join("") +
      " ORDER BY (lower(title) LIKE ?) DESC, message_count DESC LIMIT 15",
    args: [owner, ...chats, ...words.map((w) => `%${w}%`), `%${words.join(" ")}%`],
  });
  const matches = result.rows.map(toEpisode);
  for (const e of matches) {
    const chat = refs.find((c) => c.key === e.conversation)?.title ?? e.conversation;
    console.error(`#${e.id}  ${new Date(e.startTs).toISOString().slice(0, 10)}  ${e.messageCount} msgs  [${e.mood}]  ${e.title}  (${chat})`);
  }
  if (values.list) process.exit(0);
  if (!matches.length) throw new Error("No episode matches " + JSON.stringify(values.search));
  ids = [matches[0].id];
}
if (!ids.length || ids.some((id) => !Number.isInteger(id))) {
  console.error('usage: pnpm props <episodeId[,episodeId...]> | --search "words" [--chat name] [--list]');
  process.exit(1);
}

const episodes = (
  await client.execute({ sql: `SELECT ${EPISODE_COLUMNS} FROM episodes WHERE owner = ? AND id IN (${ids.map(() => "?").join(",")})`, args: [owner, ...ids] })
).rows
  .map(toEpisode)
  .sort((a, b) => a.startTs - b.startTs);
if (episodes.length !== ids.length) throw new Error("Unknown episode id among " + ids.join(","));
const conversation = episodes[0].conversation;
if (episodes.some((e) => e.conversation !== conversation)) throw new Error("Merged episodes must come from one chat");
const ref = refs.find((c) => c.key === conversation);
if (!ref) throw new Error("Conversation missing from " + values.refs);

const rows = (
  await client.execute({
    sql: "SELECT id, ts, sender, kind, text, meta FROM messages WHERE owner = ? AND conversation = ? AND ts >= ? AND ts <= ? ORDER BY ts, id",
    args: [owner, conversation, episodes[0].startTs, episodes[episodes.length - 1].endTs],
  })
).rows;
const inEpisode = (ts: number) => episodes.some((e) => ts >= e.startTs && ts <= e.endTs);
const display = (sender: string) => (sender === ref.selfName ? "Me" : sender);
const NOISE = [/^\S+ liked a message\.?$/i, /^(\S+ )?reacted .+ to your message\.?$/i, /^\S+ sent an attachment\.?$/i, /^you sent an attachment\.?$/i];
const MEDIA_KINDS: MediaKind[] = ["photo", "video", "audio", "sticker", "gif", "file", "share", "location"];
const emoji = (e: string) => (/^\p{Extended_Pictographic}$/u.test(e) ? e + "\uFE0F" : e);

/** Every message of the stretch, with system noise dropped and attachments turned into placeholder bubbles. */
const all = rows.map((r) => {
  const meta = r.meta ? (JSON.parse(String(r.meta)) as { media?: string[]; reactions?: { emoji: string }[] }) : {};
  const raw = r.text === null ? null : String(r.text).replace(/\uFFFC/g, "").trim();
  const link = !!raw && /^https?:\/\/\S+$/.test(raw);
  const text = raw && !link && !NOISE.some((re) => re.test(raw)) ? raw : null;
  const media = link ? "share" : MEDIA_KINDS.find((k) => meta.media?.includes(k));
  const message: ReelMessage = {
    id: Number(r.id),
    sender: display(String(r.sender)),
    isMe: String(r.sender) === ref.selfName,
    text,
    ts: Number(r.ts),
    ...(media && !text ? { media } : {}),
    ...(meta.reactions?.length ? { reactions: meta.reactions.map((x) => emoji(x.emoji)) } : {}),
  };
  const usable = String(r.sender) !== "" && (r.kind === "text" || r.kind === "media") && (text !== null || media !== undefined);
  return { message, usable: usable && inEpisode(Number(r.ts)) };
});
const candidates = all.filter((x) => x.usable).map((x) => x.message);
const byId = new Map(candidates.map((m) => [m.id, m]));
const allPlans = episodes.flatMap((e) => e.plans);

interface Picks {
  keep: number[];
  highlights: number[];
  plans: { index: number; label: string; when: string }[];
  title: string;
}

const PICKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["keep", "highlights", "plans", "title"],
  properties: {
    keep: { type: "array", items: { type: "integer" }, description: "#ids of the messages to show, in chat order" },
    highlights: { type: "array", items: { type: "integer" }, description: "#ids of 2-4 quotable text messages, best first" },
    plans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "label", "when"],
        properties: {
          index: { type: "integer" },
          label: { type: "string", description: "max 40 characters, no dates" },
          when: { type: "string", description: "max 12 characters, e.g. \"Dec 19–20\" or \"NYE\"; empty if unknown" },
        },
      },
    },
    title: { type: "string" },
  },
};

async function pickWithModel(apiKey: string): Promise<Picks> {
  const transcript = candidates
    .map((m) => `#${m.id} ${m.sender}: ${m.text ?? "[" + m.media + "]"}${m.reactions ? " (reactions: " + m.reactions.join("") + ")" : ""}`)
    .join("\n")
    .slice(0, PROMPT_MAX_CHARS);
  const keepRule =
    candidates.length <= MAX_KEEP
      ? "keep: return []; the stretch is short enough to show whole."
      : `keep: choose ${MIN_KEEP}-${MAX_KEEP} #ids (aim for about 28) that tell the story on their own: the setup, the funniest or most emotional lines, decisions and their replies. Keep question/answer pairs together and drop filler (\"ok\", \"lol\", duplicate links) unless it is the punchline.`;
  const user = [
    `Chat: ${ref!.title} (${ref!.kind})`,
    `Episode: ${episodes.map((e) => e.title + " - " + e.summary).join(" | ")}`,
    "Plans found earlier:",
    ...allPlans.map((p, i) => `[${i}] ${p.what} (${p.date ?? p.when})`),
    "",
    "Transcript (#id sender: text):",
    transcript,
  ].join("\n");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "gpt-5-mini",
        reasoning_effort: "minimal",
        messages: [
          {
            role: "system",
            content: [
              "You edit a 20-second vertical 'memory reel' that replays a moment from a chat. \"Me\" is the user. Use only #ids from the transcript.",
              keepRule,
              `highlights: 2-4 #ids of short text messages (under ${QUOTE_MAX_CHARS} characters) that capture the moment and would look great as a big full-screen quote: funny, warm, iconic or decisive, best first, and each must make sense on its own without the rest of the chat. Prefer different senders. Never pick logistics details, bare numbers or prices, filler or a link.`,
              `plans: up to ${MAX_PLANS} of the listed plans that matter most (by [index]) in the order they would happen, each rewritten as a short label of at most 40 characters in the chat's voice with no dates, like "fly to Shanghai" or "crab roe noodles in Shanghai", plus a short "when" saying when it would happen (at most 12 characters, like "Dec 19–20" or "NYE"; empty when the chat doesn't say, never the day it was discussed). Only things people intend to do: skip prices, costs, duplicates of another plan and vague ideas; return [] when nothing is concrete.`,
              "title: a 2-6 word title for the reel.",
            ].join("\n"),
          },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "reel_picks", strict: true, schema: PICKS_SCHEMA } },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return JSON.parse(json.choices[0].message.content) as Picks;
    }
    if (attempt >= 2 || (res.status !== 429 && res.status < 500)) throw new Error("Reel picks failed: " + res.status + " " + (await res.text()).slice(0, 300));
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

/** Without a model: the longest messages spread over the stretch, and the punchiest short lines as quotes. */
function pickHeuristically(): Picks {
  const ranked = [...candidates].sort((a, b) => (b.text?.length ?? 5) + (b.reactions?.length ?? 0) * 40 - ((a.text?.length ?? 5) + (a.reactions?.length ?? 0) * 40));
  const keep = ranked.slice(0, 28).map((m) => m.id);
  const quotes = ranked.filter((m) => m.text && m.text.length >= 12 && m.text.length <= QUOTE_MAX_CHARS);
  return { keep, highlights: quotes.map((m) => m.id), plans: allPlans.slice(0, MAX_PLANS).map((p, index) => ({ index, label: p.what, when: "" })), title: episodes[0].title };
}

function apiKey(): string | null {
  if (values["no-llm"]) return null;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    return readFileSync(values.env, "utf8").match(/^OPENAI_API_KEY=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

const key = apiKey();
if (!key) console.error("No OPENAI_API_KEY: picking messages heuristically.");
const picks = key ? await pickWithModel(key) : pickHeuristically();

const quotable = (id: number) => {
  const text = byId.get(id)?.text;
  return !!text && text.length >= QUOTE_MIN_CHARS && [...text].length <= QUOTE_MAX_CHARS;
};
const highlights = [...new Set(picks.highlights)].filter(quotable).slice(0, 2);
const chosen = candidates.length <= MAX_KEEP ? candidates.map((m) => m.id) : picks.keep.filter((id) => byId.has(id));
let keep = new Set([...highlights, ...chosen]);
if (keep.size < Math.min(MIN_KEEP, candidates.length)) {
  console.error(`Model kept only ${keep.size} valid ids; topping up.`);
  for (const id of pickHeuristically().keep) if (keep.size < MIN_KEEP) keep.add(id);
}
if (keep.size > MAX_KEEP) keep = new Set([...keep].slice(0, MAX_KEEP));

let skipped = 0;
const messages: ReelMessage[] = [];
for (const { message } of all) {
  if (!keep.has(message.id)) {
    skipped++;
    continue;
  }
  messages.push(skipped && messages.length ? { ...message, skippedBefore: skipped } : message);
  skipped = 0;
}

const plans: ReelPlan[] = [];
for (const p of picks.plans) {
  const source = allPlans[p.index];
  if (!source || plans.some((x) => x.what === p.label)) continue;
  plans.push({ what: p.label.trim().slice(0, 48) || source.what, date: source.date, when: p.when.trim().slice(0, 16) });
}

const names = [...new Set(messages.map((m) => m.sender))];
const colors = assignColors(names);
const moodWeight = new Map<string, number>();
for (const e of episodes) moodWeight.set(e.mood, (moodWeight.get(e.mood) ?? 0) + e.messageCount);
const mood = values.mood ?? [...moodWeight].sort((a, b) => b[1] - a[1])[0][0];

const props: ReelProps = {
  chat: {
    title: ref.title,
    platform: (PLATFORMS as readonly string[]).includes(ref.platform) ? (ref.platform as ReelPlatform) : "other",
    kind: ref.kind === "group" ? "group" : "dm",
  },
  participants: names.map((name) => ({ name, color: colors.get(name)!, isMe: name === "Me" })),
  episode: {
    title: episodes.length > 1 ? picks.title || episodes[0].title : episodes[0].title,
    summary: episodes.map((e) => e.summary).join(" "),
    startTs: messages[0]?.ts ?? episodes[0].startTs,
    endTs: messages[messages.length - 1]?.ts ?? episodes[episodes.length - 1].endTs,
    mood: (MOODS as readonly string[]).includes(mood) ? (mood as ReelMood) : "chill",
    timeZone: values.tz,
  },
  messages,
  highlights,
  plans: plans.slice(0, MAX_PLANS),
  photos: (values.photos ?? "").split(",").filter(Boolean),
};

const out = values.out ?? join(root, ".data", ids.join("-") + ".json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(props, null, 2) + "\n");
console.error(`${props.episode.title}: kept ${messages.length}/${candidates.length} messages, ${highlights.length} highlights, ${props.plans.length} plans -> ${out}`);
