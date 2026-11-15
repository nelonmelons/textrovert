#!/usr/bin/env node
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  readRecording,
  framesToConversation,
  ingestText,
  ingestZip,
  rankConversations,
  reassignSelf,
  renderTranscript,
  type Conversation,
  type FrameExtraction,
} from "./index.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    self: { type: "string" },
    out: { type: "string", default: "out" },
    fps: { type: "string", default: "6" },
    "recorded-at": { type: "string" },
    model: { type: "string" },
    frames: { type: "string" },
    pick: { type: "string" },
  },
});

const input = positionals[0];
if (!input && !values.frames) {
  console.error("usage: textrovert-ingest <chat.txt|export.zip|imessage-export-dir|recording.mp4> [--pick 1,3] [--self NAME] [--out DIR] [--fps 6] [--recorded-at ISO] [--frames frames.json]");
  process.exit(1);
}

const execFileAsync = promisify(execFile);

function videoDuration(path: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString().trim());
}

async function frameAt(path: string, timeSec: number): Promise<string> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-ss", String(timeSec), "-i", path, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  return `data:image/jpeg;base64,${stdout.toString("base64")}`;
}

function safeName(s: string): string {
  return s.replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 60) || "chat";
}

async function run(): Promise<Conversation[]> {
  const name = input ? basename(input, extname(input)) : basename(values.frames!, ".frames.json");
  const ext = input ? extname(input).toLowerCase() : "";
  const recordedAt = values["recorded-at"] ? new Date(values["recorded-at"]) : input ? statSync(input).mtime : new Date();
  mkdirSync(values.out!, { recursive: true });
  if (input && statSync(input).isDirectory()) {
    return readdirSync(input)
      .filter((f) => f.endsWith(".txt") && statSync(join(input, f)).size > 0)
      .flatMap((f) => {
        try {
          const conv = ingestText(readFileSync(join(input, f), "utf8"), { selfName: values.self });
          conv.sourceId = f;
          conv.title ??= basename(f, ".txt");
          return [conv];
        } catch {
          return [];
        }
      });
  }

  if (values.frames || [".mp4", ".mov", ".m4v", ".webm"].includes(ext)) {
    let frames: FrameExtraction[];
    if (values.frames) {
      frames = JSON.parse(readFileSync(values.frames, "utf8"));
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is required to read screen recordings.");
      frames = await readRecording({
        durationSec: videoDuration(input),
        fps: Number(values.fps),
        getFrame: (t) => frameAt(input, t),
        vision: { apiKey, model: values.model ?? process.env.OPENAI_VISION_MODEL },
        onProgress: (d, t) => process.stderr.write(`\r  read ${d}/${t} chunks`),
      });
      process.stderr.write("\n");
      writeFileSync(join(values.out!, `${name}.frames.json`), JSON.stringify(frames, null, 2));
    }
    return [framesToConversation(frames, { recordedAt })];
  }
  if (ext === ".zip") return ingestZip(readFileSync(input), { selfName: values.self });
  return [ingestText(readFileSync(input, "utf8"), { selfName: values.self })];
}

const convs = await run();
const write = (conv: Conversation, name: string) => {
  const fixed = values.self && !conv.participants.some((p) => p.isSelf && p.name === values.self) ? reassignSelf(conv, values.self) : conv;
  writeFileSync(join(values.out!, `${name}.conversation.json`), JSON.stringify(fixed, null, 2));
  const transcript = renderTranscript(fixed);
  writeFileSync(join(values.out!, `${name}.transcript.txt`), transcript);
  return transcript;
};

const isBulk = !!input && (statSync(input).isDirectory() || convs.length > 1);
if (!isBulk) {
  process.stdout.write(write(convs[0], input ? basename(input, extname(input)) : basename(values.frames!, ".frames.json")));
} else {
  const ranked = rankConversations(convs);
  const picks = values.pick?.split(",").map((n) => Number(n.trim())) ?? [];
  for (const [rank, s] of ranked.entries()) {
    const mark = picks.includes(rank + 1) ? "*" : " ";
    console.log(`${mark}${String(rank + 1).padStart(3)}. ${s.title.slice(0, 32).padEnd(32)} ${s.isGroup ? "group" : "1:1  "} ${String(s.messageCount).padStart(6)} msgs  ${String(s.recentCount).padStart(4)} last 30d  last ${s.lastTs?.slice(0, 10) ?? "?"}  score ${s.score}`);
  }
  for (const n of picks) {
    const s = ranked[n - 1];
    if (!s) continue;
    write(convs[s.index], safeName(s.title));
    console.error(`wrote ${join(values.out!, safeName(s.title))}.transcript.txt`);
  }
  if (!picks.length) console.error("\nPick chats to export with --pick 1,3,5");
}
