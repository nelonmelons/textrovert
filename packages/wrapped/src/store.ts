// Edition cache per owner, conversation and visible date range, so reopening shows the same edition.

import { editionSourceIDs, rangeCacheKey, type WrappedDateRange, type WrappedEdition } from "./models";

/** The subset of AsyncStorage the cache needs. */
export interface WrappedStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** In-memory storage, for tests and hosts without persistence. */
export class MemoryStorage implements WrappedStorage {
  readonly items = new Map<string, string>();
  async getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  async removeItem(key: string) {
    this.items.delete(key);
  }
}

export interface WrappedSession {
  editions: WrappedEdition[];
  currentIndex: number;
  carriedSeen: string[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const emptySession = (): WrappedSession => ({ editions: [], currentIndex: 0, carriedSeen: [] });

export function seenSourceIDs(session: WrappedSession): Set<string> {
  const seen = new Set(session.carriedSeen);
  for (const e of session.editions) for (const id of editionSourceIDs(e)) seen.add(id);
  return seen;
}

/**
 * Loads once, then reads synchronously; every update is written through in order. Await `update` (or `flushed`)
 * when the write must land before continuing.
 */
export class WrappedEditionStore {
  static readonly defaultKey = "textrovert.wrapped.sessions.v1";

  private writes: Promise<void> = Promise.resolve();

  private constructor(
    private readonly storage: WrappedStorage,
    private readonly storageKey: string,
    private sessions: Record<string, WrappedSession>,
  ) {}

  static async open(storage: WrappedStorage, storageKey = WrappedEditionStore.defaultKey): Promise<WrappedEditionStore> {
    let sessions: Record<string, WrappedSession> = {};
    try {
      const raw = await storage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) sessions = parsed;
    } catch {
      sessions = {};
    }
    return new WrappedEditionStore(storage, storageKey, sessions);
  }

  static key(ownerID: string, conversationID: string, range: WrappedDateRange): string {
    return `${ownerID}|${conversationID}|${rangeCacheKey(range)}`;
  }

  session(key: string): WrappedSession {
    const s = this.sessions[key];
    return s ? clone(s) : emptySession();
  }

  update(key: string, change: (session: WrappedSession) => void): Promise<void> {
    const session = this.sessions[key] ? clone(this.sessions[key]) : emptySession();
    change(session);
    this.sessions[key] = session;
    const data = JSON.stringify(this.sessions);
    return this.enqueue(() => this.storage.setItem(this.storageKey, data));
  }

  removeAll(): Promise<void> {
    this.sessions = {};
    return this.enqueue(() => this.storage.removeItem(this.storageKey));
  }

  get flushed(): Promise<void> {
    return this.writes;
  }

  private enqueue(write: () => Promise<void>): Promise<void> {
    this.writes = this.writes.then(write, write);
    return this.writes;
  }
}
