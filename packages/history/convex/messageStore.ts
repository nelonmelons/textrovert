import { createClient, type Client } from "@libsql/client/web";

import { EpisodeIndex } from "../pipeline/assistant/episodes";
import { FactIndex } from "../pipeline/assistant/facts";
import { MemoryIndex } from "../pipeline/assistant/memory";
import { stableId } from "../pipeline/hash";
import { PortraitCache } from "../pipeline/portrait/cache";
import { MessageStore } from "../pipeline/store";

let client: Client | null = null;
let store: Promise<MessageStore> | null = null;
let memory: Promise<MemoryIndex> | null = null;
let episodes: Promise<EpisodeIndex> | null = null;
let facts: Promise<FactIndex> | null = null;
let portraits: Promise<PortraitCache> | null = null;

function tursoClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error(
        "The message store isn't configured. Run: npx convex env set TURSO_DATABASE_URL <libsql://...> and npx convex env set TURSO_AUTH_TOKEN <token>",
      );
    }
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

/** The Turso-backed message store, created once per runtime instance and migrated on first use. */
export function getMessageStore(): Promise<MessageStore> {
  if (!store) {
    store = (async () => {
      const messageStore = new MessageStore(tursoClient());
      await messageStore.migrate();
      return messageStore;
    })();
    store.catch(() => {
      store = null;
    });
  }
  return store;
}

/** Chunk embeddings for the assistant's meaning search, in the same Turso database as the messages. */
export function getMemoryIndex(): Promise<MemoryIndex> {
  if (!memory) {
    memory = (async () => {
      const index = new MemoryIndex(tursoClient());
      await index.migrate();
      return index;
    })();
    memory.catch(() => {
      memory = null;
    });
  }
  return memory;
}

/** Summarized episodes with facets and embeddings, for the assistant's topic, grouping and plan tools. */
export function getEpisodeIndex(): Promise<EpisodeIndex> {
  if (!episodes) {
    episodes = (async () => {
      const index = new EpisodeIndex(tursoClient());
      await index.migrate();
      return index;
    })();
    episodes.catch(() => {
      episodes = null;
    });
  }
  return episodes;
}

/** Facts about people with validity windows and character-exact sources. */
export function getFactIndex(): Promise<FactIndex> {
  if (!facts) {
    facts = (async () => {
      const index = new FactIndex(tursoClient());
      await index.migrate();
      return index;
    })();
    facts.catch(() => {
      facts = null;
    });
  }
  return facts;
}

/** Cached memoirs and the built portrait, so the friend and portrait routes don't rebuild them per request. */
export function getPortraitCache(): Promise<PortraitCache> {
  if (!portraits) {
    portraits = (async () => {
      const cache = new PortraitCache(tursoClient());
      await cache.migrate();
      return cache;
    })();
    portraits.catch(() => {
      portraits = null;
    });
  }
  return portraits;
}

/**
 * The id that partitions an owner's rows in the message store: a hash of the owner key, so the store never holds the
 * key itself (it is the user's credential) and every row and index entry stays short.
 */
export function storeOwner(ownerKey: string): string {
  return stableId("owner", ownerKey);
}
