import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

import type { ConversationRef } from "../../history/pipeline/assistant/agent";
import { EpisodeIndex } from "../../history/pipeline/assistant/episodes";
import { analyzePortrait, loadPortraitSource, openAiStoryWriter } from "../../history/pipeline/portrait/build";
import type { Story } from "../../history/pipeline/portrait/types";
import { MessageStore } from "../../history/pipeline/store";

/**
 * Writes .data/portrait.json from the local store with the builder the API uses (packages/history/pipeline/portrait),
 * plus memoirs for the closest people. Responses are cached in .data/llm-cache, so reruns cost nothing.
 */
const here = dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = "/Users/nelonmelon/.capy/worktrees/jam_01M7GBM02Z5B6TSMPC8188Z6V7/textrovert/packages";
const historyData = join(LOCAL_ROOT, "history/.data");
const DB = process.env.PORTRAIT_DB ?? join(historyData, "ig.db");
const REFS = process.env.PORTRAIT_REFS ?? join(historyData, "ig-refs.json");
const OWNER = process.env.PORTRAIT_OWNER ?? "local-ig";
const TZ = process.env.PORTRAIT_TZ ?? "America/Los_Angeles";
const ENV_FILE = process.env.PORTRAIT_ENV ?? join(LOCAL_ROOT, "ingest/.env");
const OUT_DIR = resolve(here, "../.data");
const CACHE_DIR = join(OUT_DIR, "llm-cache");
const STORY_PEOPLE = Number(process.env.PORTRAIT_STORIES ?? 15);

const refs = JSON.parse(readFileSync(REFS, "utf8")) as ConversationRef[];
const client = createClient({ url: "file:" + DB });
console.log("reading", refs.length, "conversations");
const source = await loadPortraitSource(new MessageStore(client), new EpisodeIndex(client), OWNER, refs, TZ);
console.log("messages", [...source.messages.values()].reduce((s, l) => s + l.length, 0), "episodes", source.episodes.length);
const analysis = analyzePortrait(source);

const apiKey = process.env.OPENAI_API_KEY ?? (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").match(/OPENAI_API_KEY=(.*)/)?.[1]?.trim() : undefined);
mkdirSync(CACHE_DIR, { recursive: true });
const cacheFile = (body: string) => join(CACHE_DIR, createHash("sha256").update(body).digest("hex").slice(0, 32) + ".json");
const write = openAiStoryWriter(apiKey ?? "", {
  get: (body) => (existsSync(cacheFile(body)) ? JSON.parse(readFileSync(cacheFile(body), "utf8")) : apiKey ? undefined : Promise.reject(new Error("No OPENAI_API_KEY"))),
  put: (body, value) => writeFileSync(cacheFile(body), JSON.stringify(value)),
});

const storyPeople = analysis.portrait.people.filter((p) => p.total > 30).slice(0, STORY_PEOPLE);
const stories: Story[] = [];
for (let i = 0; i < storyPeople.length; i += 5) {
  const batch = await Promise.all(
    storyPeople.slice(i, i + 5).map((p) =>
      analysis.storyFor(p.id, write).catch((error) => {
        console.warn("story failed for a person:", error instanceof Error ? error.message : error);
        return null;
      }),
    ),
  );
  for (const s of batch) if (s) stories.push(s);
}

const portrait = analysis.withStories(stories);
mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, "portrait.json");
writeFileSync(outFile, JSON.stringify(portrait));
console.log("wrote", outFile, Math.round(JSON.stringify(portrait).length / 1024) + " KB;", portrait.people.length, "people,", portrait.groups.length, "groups,", portrait.edges.length, "edges,", stories.length, "stories");
