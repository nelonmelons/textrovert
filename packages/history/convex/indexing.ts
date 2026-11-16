import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const progressV = v.object({
  total: v.number(),
  priority: v.number(),
  chunks: v.number(),
  episodes: v.number(),
  facts: v.number(),
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
});

/** The owner's assistant indexing progress, or null before the first index run. */
export const get = internalQuery({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const row = await ctx.db
      .query("indexing")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
      .unique();
    if (!row) return null;
    const { total, priority, chunks, episodes, facts, startedAt, finishedAt, updatedAt } = row;
    return { total, priority, chunks, episodes, facts, startedAt, finishedAt, updatedAt };
  },
});

/** Upserts the owner's progress; assistant.index writes it after every chat in every pass. */
export const save = internalMutation({
  args: { ownerKey: v.string(), progress: progressV },
  returns: v.null(),
  handler: async (ctx, { ownerKey, progress }) => {
    const row = await ctx.db
      .query("indexing")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
      .unique();
    if (row) await ctx.db.patch("indexing", row._id, { ...progress, updatedAt: Date.now() });
    else await ctx.db.insert("indexing", { ownerKey, ...progress, updatedAt: Date.now() });
    return null;
  },
});
