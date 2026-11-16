import { query } from "./_generated/server";

// Round-trip check used by the starter screen. Delete once the app has real queries.
export const ping = query({
  args: {},
  handler: async () => {
    return { ok: true, serverTime: Date.now() };
  },
});
