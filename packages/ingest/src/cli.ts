#!/usr/bin/env node
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  readRecording,
  framesToConversation,
  ingestText,
  ingestWhatsAppZip,
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
  },
});

const input = positionals[0];
if (!input && !values.frames) {
  console.error("usage: textrovert-ingest <chat.txt|chat.zip|recording.mp4> [--self NAME] [--out DIR] [--fps 4] [--recorded-at ISO] [--frames frames.json]");
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

async function run(): Promise<Conversation> {
  const name = input ? basename(input, extname(input)) : basename(values.frames!, ".frames.json");
  const ext = input ? extname(input).toLowerCase() : "";
  const recordedAt = values["recorded-at"] ? new Date(values["recorded-at"]) : input ? statSync(input).mtime : new Date();
  mkdirSync(values.out!, { recursive: true });

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
    return framesToConversation(frames, { recordedAt });
  }
  if (ext === ".zip") return ingestWhatsAppZip(readFileSync(input), { selfName: values.self });
  return ingestText(readFileSync(input, "utf8"), { selfName: values.self });
}

let conv = await run();
if (values.self && !conv.participants.some((p) => p.isSelf && p.name === values.self)) conv = reassignSelf(conv, values.self);
const name = input ? basename(input, extname(input)) : basename(values.frames!, ".frames.json");
writeFileSync(join(values.out!, `${name}.conversation.json`), JSON.stringify(conv, null, 2));
const transcript = renderTranscript(conv);
writeFileSync(join(values.out!, `${name}.transcript.txt`), transcript);
process.stdout.write(transcript);
