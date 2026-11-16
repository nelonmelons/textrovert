import type { Client } from "@libsql/client";

import type { Story } from "./types";

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS portrait_cache (owner TEXT NOT NULL, key TEXT NOT NULL, version TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (owner, key))",
];

const storyKey = (name: string) => "story:" + name.trim().toLowerCase();

/**
 * LLM-written memoirs and the built portrait, cached per owner so requests don't pay for them twice. A memoir is
 * written once per person and kept until it is refreshed; the portrait is rebuilt when its version (the store's
 * newest message and episode, and the newest memoir) changes.
 */
export class PortraitCache {
  constructor(private readonly db: Client) {}

  async migrate(): Promise<void> {
    await this.db.batch(SCHEMA, "write");
  }

  async get(owner: string, key: string): Promise<{ version: string; value: string } | null> {
    const result = await this.db.execute({ sql: "SELECT version, value FROM portrait_cache WHERE owner = ? AND key = ?", args: [owner, key] });
    const row = result.rows[0];
    return row ? { version: String(row.version), value: String(row.value) } : null;
  }

  async put(owner: string, key: string, version: string, value: string): Promise<void> {
    await this.db.execute({
      sql: "INSERT INTO portrait_cache (owner, key, version, value, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(owner, key) DO UPDATE SET version = excluded.version, value = excluded.value, updated_at = excluded.updated_at",
      args: [owner, key, version, value, Date.now()],
    });
  }

  async story(owner: string, name: string): Promise<{ story: Story; writtenAt: number } | null> {
    const hit = await this.get(owner, storyKey(name));
    return hit ? { story: JSON.parse(hit.value) as Story, writtenAt: Number(hit.version) } : null;
  }

  async putStory(owner: string, name: string, story: Story): Promise<void> {
    await this.put(owner, storyKey(name), String(Date.now()), JSON.stringify(story));
  }

  /** Every cached memoir by the person's lowercased name, and when the newest was written. */
  async stories(owner: string): Promise<{ byName: Map<string, Story>; newest: number }> {
    const result = await this.db.execute({ sql: "SELECT key, value, updated_at FROM portrait_cache WHERE owner = ? AND key LIKE 'story:%'", args: [owner] });
    return {
      byName: new Map(result.rows.map((r) => [String(r.key).slice("story:".length), JSON.parse(String(r.value)) as Story])),
      newest: Math.max(0, ...result.rows.map((r) => Number(r.updated_at))),
    };
  }

  async deleteOwner(owner: string): Promise<void> {
    await this.db.execute({ sql: "DELETE FROM portrait_cache WHERE owner = ?", args: [owner] });
  }
}
