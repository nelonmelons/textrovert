import { createClient } from "@libsql/client/web";

import { stableId } from "../pipeline/hash";
import { MessageStore } from "../pipeline/store";

let store: Promise<MessageStore> | null = null;

/** The Turso-backed message store, created once per runtime instance and migrated on first use. */
export function getMessageStore(): Promise<MessageStore> {
  if (!store) {
    store = (async () => {
      const url = process.env.TURSO_DATABASE_URL;
      if (!url) {
        throw new Error(
          "The message store isn't configured. Run: npx convex env set TURSO_DATABASE_URL <libsql://...> and npx convex env set TURSO_AUTH_TOKEN <token>",
        );
      }
      const messageStore = new MessageStore(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }));
      await messageStore.migrate();
      return messageStore;
    })();
    store.catch(() => {
      store = null;
    });
  }
  return store;
}

/**
 * The id that partitions an owner's rows in the message store: a hash of the owner key, so the store never holds the
 * key itself (it is the user's credential) and every row and index entry stays short.
 */
export function storeOwner(ownerKey: string): string {
  return stableId("owner", ownerKey);
}
