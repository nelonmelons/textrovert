#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { ingestText, type Conversation } from "@textrovert/ingest";

const CONFIG_DIR = join(homedir(), ".textrovert");
const CONFIG_PATH = join(CONFIG_DIR, "sync.json");
const LABEL = "com.textrovert.imessage-sync";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG_PATH = join(homedir(), "Library", "Logs", "textrovert-sync.log");
const OVERLAP_DAYS = 1;
const BATCH_BYTES = 4 * 1024 * 1024;

interface Config {
  convexUrl: string;
  deviceId: string;
  lastSyncMs: number | null;
  exporter: string;
  only?: string;
}

function loadConfig(): Config | null {
  return existsSync(CONFIG_PATH) ? (JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config) : null;
}

function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

function findExporter(): string {
  for (const candidate of ["/opt/homebrew/bin/imessage-exporter", "/usr/local/bin/imessage-exporter", join(homedir(), ".cargo/bin/imessage-exporter")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("imessage-exporter not found. Install it with: brew install imessage-exporter");
}

function exportMessages(config: Config, sinceMs: number | null): string {
  const out = mkdtempSync(join(tmpdir(), "textrovert-sync-"));
  const args = ["-f", "txt", "-o", join(out, "export"), "--no-progress"];
  if (sinceMs !== null) {
    const since = new Date(sinceMs - OVERLAP_DAYS * 86_400_000);
    args.push("-s", `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`);
  }
  if (config.only) args.push("-t", config.only);
  try {
    execFileSync(config.exporter, args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? String(err);
    if (/Operation not permitted|full disk access/i.test(stderr)) {
      throw new Error(`No Full Disk Access. Grant it to ${process.execPath} (and ${config.exporter}) in System Settings > Privacy & Security > Full Disk Access.`);
    }
    throw new Error(`imessage-exporter failed: ${stderr.trim()}`);
  }
  return join(out, "export");
}

function parseExportDir(dir: string): Conversation[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt") && f !== "orphaned.txt" && statSync(join(dir, f)).size > 0)
    .flatMap((f) => {
      try {
        const conv = ingestText(readFileSync(join(dir, f), "utf8"));
        conv.sourceId = basename(f, ".txt");
        conv.title ??= conv.sourceId;
        return conv.messages.length ? [conv] : [];
      } catch (err) {
        log(`skipped ${f}: ${(err as Error).message}`);
        return [];
      }
    });
}

async function push(config: Config, conversations: Conversation[]): Promise<{ received: number; updated: number }> {
  const client = new ConvexHttpClient(config.convexUrl);
  let batch: string[] = [];
  let size = 0;
  const totals = { received: 0, updated: 0 };
  const flush = async () => {
    if (!batch.length) return;
    const res = (await client.action(anyApi.sync.pushChats, { deviceId: config.deviceId, chats: batch })) as { received: number; updated: number };
    totals.received += res.received;
    totals.updated += res.updated;
    batch = [];
    size = 0;
  };
  for (const conv of conversations) {
    const json = JSON.stringify(conv);
    if (size + json.length > BATCH_BYTES) await flush();
    batch.push(json);
    size += json.length;
  }
  await flush();
  return totals;
}

async function run(opts: { fromDir?: string; full: boolean }): Promise<void> {
  const config = loadConfig();
  if (!config) throw new Error(`Not configured. Run: textrovert-sync setup --convex-url https://<deployment>.convex.cloud`);
  const startedAt = Date.now();
  const since = opts.full ? null : config.lastSyncMs;
  const dir = opts.fromDir ? resolve(opts.fromDir) : exportMessages(config, since);
  try {
    const conversations = parseExportDir(dir);
    const messages = conversations.reduce((n, c) => n + c.messages.length, 0);
    const result = await push(config, conversations);
    if (!opts.fromDir) saveConfig({ ...config, lastSyncMs: startedAt });
    log(`${opts.fromDir ? "folder" : since === null ? "full" : "incremental"} sync: ${conversations.length} chats, ${messages} messages exported, ${result.updated} chats updated`);
  } finally {
    if (!opts.fromDir) rmSync(dirname(dir), { recursive: true, force: true });
  }
}

function install(intervalSec: number): void {
  const script = fileURLToPath(import.meta.url);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${script}</string>
    <string>run</string>
  </array>
  <key>StartInterval</key><integer>${intervalSec}</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${LOG_PATH}</string>
  <key>StandardErrorPath</key><string>${LOG_PATH}</string>
</dict>
</plist>
`;
  mkdirSync(dirname(PLIST_PATH), { recursive: true });
  try {
    execFileSync("launchctl", ["bootout", `gui/${process.getuid!()}`, PLIST_PATH], { stdio: "ignore" });
  } catch {}
  writeFileSync(PLIST_PATH, plist);
  execFileSync("launchctl", ["bootstrap", `gui/${process.getuid!()}`, PLIST_PATH]);
  console.log(`Installed ${LABEL}: runs every ${intervalSec / 60} min and on login. Logs: ${LOG_PATH}`);
  console.log(`Grant Full Disk Access to ${process.execPath} in System Settings > Privacy & Security > Full Disk Access, or the job cannot read chat.db.`);
}

function uninstall(): void {
  try {
    execFileSync("launchctl", ["bootout", `gui/${process.getuid!()}`, PLIST_PATH], { stdio: "ignore" });
  } catch {}
  rmSync(PLIST_PATH, { force: true });
  console.log(`Removed ${LABEL}.`);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "convex-url": { type: "string" },
    only: { type: "string" },
    "from-dir": { type: "string" },
    full: { type: "boolean", default: false },
    interval: { type: "string", default: "900" },
  },
});

const command = positionals[0] ?? "run";
try {
  if (command === "setup") {
    const existing = loadConfig();
    const convexUrl = values["convex-url"] ?? existing?.convexUrl;
    if (!convexUrl) throw new Error("setup needs --convex-url https://<deployment>.convex.cloud");
    saveConfig({ convexUrl, deviceId: existing?.deviceId ?? randomUUID(), lastSyncMs: existing?.lastSyncMs ?? null, exporter: findExporter(), only: values.only ?? existing?.only });
    console.log(`Saved ${CONFIG_PATH}. Device id: ${loadConfig()!.deviceId}`);
  } else if (command === "run") {
    await run({ fromDir: values["from-dir"], full: values.full! });
  } else if (command === "install") {
    install(Number(values.interval));
  } else if (command === "uninstall") {
    uninstall();
  } else if (command === "status") {
    const config = loadConfig();
    console.log(JSON.stringify({ config, agentInstalled: existsSync(PLIST_PATH), log: LOG_PATH }, null, 2));
  } else {
    throw new Error(`Unknown command "${command}". Use setup, run, install, uninstall, or status.`);
  }
} catch (err) {
  log(`error: ${(err as Error).message}`);
  process.exitCode = 1;
}
