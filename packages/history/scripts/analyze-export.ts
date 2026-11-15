import { mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { createClient } from "@libsql/client";

import { analyzeStoredConversations } from "../pipeline/analyze";
import { openArchive } from "../pipeline/archive";
import { ingestArchive } from "../pipeline/ingest";
import { buildInsights, buildPeople, type ConversationSummary } from "../pipeline/insights";
import { MessageStore } from "../pipeline/store";
import { LocalTime, safeTimeZone } from "../pipeline/time";

// Runs the whole pipeline locally against a SQLite file, no Convex or Turso needed:
//   pnpm analyze ~/Downloads/export.zip [more files] [--me "Your Name"] [--tz America/Los_Angeles] [--json]
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      me: { type: "string", multiple: true },
      tz: { type: "string" },
      db: { type: "string", default: ".data/messages.db" },
      json: { type: "boolean", default: false },
    },
  });
  if (positionals.length === 0) {
    console.error("usage: pnpm analyze <export.zip|file> [more files] [--me <your name>] [--tz <IANA zone>] [--db <path>] [--json]");
    process.exit(1);
  }
  const timeZone = safeTimeZone(values.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const dbPath = resolve(values.db ?? ".data/messages.db");
  await mkdir(dirname(dbPath), { recursive: true });
  const store = new MessageStore(createClient({ url: "file:" + dbPath }));
  await store.migrate();

  const owner = "local";
  const conversations = new Map<string, ConversationSummary>();
  for (const file of positionals) {
    const archive = await openArchive(resolve(file), basename(file));
    try {
      const result = await ingestArchive({
        owner,
        archive,
        store,
        timeZone,
        selfNames: values.me ?? [],
        onProgress: (p) => process.stderr.write("\r" + basename(file) + ": " + p.messagesParsed + " messages parsed, " + p.messagesStored + " new"),
      });
      process.stderr.write("\r" + basename(file) + ": " + result.messagesParsed + " messages parsed, " + result.messagesStored + " new\n");
      for (const warning of result.warnings) console.error("  warning: " + warning);
      for (const c of result.conversations) {
        conversations.set(c.key, { key: c.key, platform: c.platform, kind: c.kind, title: c.title, selfName: c.selfName, closeness: 0, stats: null });
      }
    } finally {
      await archive.close();
    }
  }

  const now = Date.now();
  for await (const r of analyzeStoredConversations(store, owner, [...conversations.values()], new LocalTime(timeZone), now)) {
    Object.assign(conversations.get(r.key)!, { stats: r.stats, closeness: r.closeness });
  }
  const summaries = [...conversations.values()];
  const people = buildPeople(summaries);
  const insights = buildInsights(summaries, people, now);

  if (values.json) {
    console.log(JSON.stringify({ insights, people, conversations: summaries }, null, 2));
    return;
  }
  const t = insights.totals;
  console.log("\n" + t.messages + " messages (" + t.sent + " sent, " + t.received + " received) in " + t.conversations + " chats; " + t.aiChats + " AI chats, " + (insights.ai?.prompts ?? 0) + " prompts");
  console.log("platforms: " + insights.platforms.map((p) => p.platform + " " + p.messages).join(", "));
  console.log("you are: " + [...new Set(summaries.map((c) => c.selfName).filter(Boolean))].join(", "));
  console.log("reply time: you " + fmt(insights.reply.myMedianSec) + ", them " + fmt(insights.reply.theirMedianSec));
  console.log("habits: " + JSON.stringify(insights.habits));
  console.log("archetypes: " + (insights.archetypes.map((a) => a.label + " (" + a.reason + ")").join("; ") || "none yet"));
  console.log("top emojis: " + insights.topEmojis.map((e) => e.text + " " + e.count).join("  "));
  console.log("top words: " + insights.topWords.slice(0, 12).map((w) => w.text).join(", "));
  console.log("\nclosest people:");
  for (const p of people.slice(0, 10)) {
    console.log("  " + p.closeness.toFixed(1).padStart(5) + "  " + p.name + " (" + p.platforms.join("+") + ", " + p.messages + " msgs)");
  }
  console.log("\nbiggest chats:");
  for (const c of [...summaries].sort((a, b) => (b.stats?.messages ?? 0) - (a.stats?.messages ?? 0)).slice(0, 10)) {
    console.log("  " + String(c.stats?.messages ?? 0).padStart(6) + "  [" + c.platform + "/" + c.kind + "] " + c.title + (c.selfName ? "" : "  (couldn't tell which sender is you; pass --me)"));
  }
}

function fmt(seconds: number | null): string {
  if (seconds === null) return "n/a";
  return seconds < 120 ? seconds + "s" : Math.round(seconds / 60) + "m";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
