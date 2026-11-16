import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { createClient } from "@libsql/client";

import { openArchive } from "../pipeline/archive";
import { findCommonGround, type SharedInterest } from "../pipeline/commonGround";
import { ingestArchive } from "../pipeline/ingest";
import { buildInterestProfile, loadOwnMessages, type ChatSource, type InterestProfile } from "../pipeline/interests";
import { openAiLlm } from "../pipeline/llm";
import { MessageStore } from "../pipeline/store";
import { safeTimeZone } from "../pipeline/time";

// Runs matching locally on two people's exports, against a throwaway SQLite file (no Convex or Turso needed):
//   OPENAI_API_KEY=... pnpm common-ground --a kevin/chat.db --b emma/chat.db [--me-a Kevin] [--me-b Emma] [--tz America/Los_Angeles] [--json]
// Pass --a/--b more than once for several exports per person.
async function main() {
  const { values } = parseArgs({
    options: {
      a: { type: "string", multiple: true },
      b: { type: "string", multiple: true },
      "me-a": { type: "string" },
      "me-b": { type: "string" },
      tz: { type: "string" },
      db: { type: "string", default: ".data/common-ground.db" },
      json: { type: "boolean", default: false },
    },
  });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!values.a?.length || !values.b?.length || !apiKey) {
    console.error("usage: OPENAI_API_KEY=... pnpm common-ground --a <export> --b <export> [--me-a <name>] [--me-b <name>] [--tz <IANA zone>] [--json]");
    process.exit(1);
  }
  const timeZone = safeTimeZone(values.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const dbPath = resolve(values.db ?? ".data/common-ground.db");
  await mkdir(dirname(dbPath), { recursive: true });
  await rm(dbPath, { force: true });
  const store = new MessageStore(createClient({ url: "file:" + dbPath }));
  await store.migrate();
  const llm = openAiLlm({ apiKey, model: process.env.OPENAI_MODEL });

  const people = [
    { owner: "a", label: "A", files: values.a, me: values["me-a"] },
    { owner: "b", label: "B", files: values.b, me: values["me-b"] },
  ];
  const started = Date.now();
  const sides = await Promise.all(
    people.map(async (person) => {
      const chats = new Map<string, ChatSource>();
      for (const file of person.files) {
        const archive = await openArchive(resolve(file), basename(file));
        try {
          const result = await ingestArchive({ owner: person.owner, archive, store, timeZone, selfNames: person.me ? [person.me] : [] });
          for (const warning of result.warnings) console.error(person.label + ": warning: " + warning);
          for (const c of result.conversations) chats.set(c.key, { key: c.key, kind: c.kind, selfName: c.selfName, participants: c.participants });
        } finally {
          await archive.close();
        }
      }
      const messages = await loadOwnMessages(store, person.owner, [...chats.values()]);
      console.error(person.label + ": " + messages.length + " messages sent in " + chats.size + " chats, finding interests...");
      const profile = await buildInterestProfile(messages, llm, {
        onProgress: (done, total) => console.error(person.label + ": read " + done + "/" + total + " chunks"),
      });
      return { owner: person.owner, chats: [...chats.values()], profile };
    }),
  );
  console.error("profiles built in " + Math.round((Date.now() - started) / 1000) + "s, comparing...");
  const ground = await findCommonGround({ store, llm, a: sides[0], b: sides[1] });
  console.error("done in " + Math.round((Date.now() - started) / 1000) + "s");

  if (values.json) {
    console.log(JSON.stringify({ a: sides[0].profile, b: sides[1].profile, ground }, null, 2));
    return;
  }
  printProfile("A", sides[0].profile);
  printProfile("B", sides[1].profile);
  console.log("\nchats with each other: " + ground.sharedChats.a + " in A's history, " + ground.sharedChats.b + " in B's");
  const hidden = ground.items.filter((i) => i.hidden);
  console.log("\nin common, never came up between you (" + hidden.length + "):");
  hidden.forEach(printItem);
  console.log("\nin common, already talked about (" + (ground.items.length - hidden.length) + "):");
  ground.items.filter((i) => !i.hidden).forEach(printItem);
}

function printProfile(label: string, profile: InterestProfile) {
  console.log("\n" + label + ": " + profile.interests.length + " interests from " + profile.messages + " messages (" + profile.read + " read)");
  for (const i of profile.interests.slice(0, 25)) console.log("  " + String(i.mentions).padStart(5) + "  " + i.name + " [" + i.category + "]: " + i.summary);
}

function printItem(item: SharedInterest) {
  console.log("  " + item.title + " [" + item.match + ", " + item.category + "]" + (item.betweenYou ? " (came up " + item.betweenYou + "x between you)" : ""));
  console.log("      A: " + item.a.detail + " (" + item.a.mentions + " msgs" + since(item.a.since) + ")");
  console.log("      B: " + item.b.detail + " (" + item.b.mentions + " msgs" + since(item.b.since) + ")");
  console.log("      try: " + item.starter);
}

function since(ts: number | null): string {
  return ts === null ? "" : ", since " + new Date(ts).toISOString().slice(0, 7);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
