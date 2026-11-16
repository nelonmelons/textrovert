import { v } from "convex/values";

import { query } from "./_generated/server";
import { findProfile } from "./lib/owner";

/** Profile-level insights ("wrapped" stats, habits, archetypes, top people). null until the first upload finishes. */
export const get = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const profile = await findProfile(ctx, ownerKey);
    if (!profile) return null;
    return {
      insights: profile.insights,
      selfNames: profile.selfNames,
      timeZone: profile.timeZone,
      updatedAt: profile.updatedAt,
    };
  },
});
