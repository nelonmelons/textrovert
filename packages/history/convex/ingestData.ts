import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { findProfile, requireProfile } from "./lib/owner";
import { conversationKindV, conversationStatsV, insightsV, personV, platformV } from "./validators";

// Internal reads and writes used by the pipeline actions in ingest.ts.

export const profile = internalQuery({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => await findProfile(ctx, ownerKey),
});

export const rememberSelfNames = internalMutation({
  args: { ownerKey: v.string(), names: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { ownerKey, names }) => {
    const profile = await requireProfile(ctx, ownerKey);
    const merged = [...new Set([...profile.selfNames, ...names.map((n) => n.slice(0, 100))])].slice(-20);
    if (merged.length !== profile.selfNames.length) await ctx.db.patch("profiles", profile._id, { selfNames: merged });
    return null;
  },
});

export const upsertConversations = internalMutation({
  args: {
    ownerKey: v.string(),
    uploadId: v.id("uploads"),
    conversations: v.array(
      v.object({
        key: v.string(),
        platform: platformV,
        kind: conversationKindV,
        title: v.string(),
        selfName: v.union(v.string(), v.null()),
        participants: v.array(v.string()),
        parsed: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { ownerKey, uploadId, conversations }) => {
    for (const c of conversations) {
      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey).eq("key", c.key))
        .unique();
      const participants = [...new Set([...(existing?.participants ?? []), ...c.participants])].slice(0, 100);
      if (existing) {
        await ctx.db.patch("conversations", existing._id, {
          title: c.title || existing.title,
          kind: c.kind,
          selfName: c.selfName ?? existing.selfName,
          participants,
          needsAnalysis: true,
          lastUploadId: uploadId,
        });
      } else {
        await ctx.db.insert("conversations", {
          ownerKey,
          key: c.key,
          platform: c.platform,
          kind: c.kind,
          title: c.title,
          selfName: c.selfName,
          participants,
          messageCount: c.parsed,
          lastAt: 0,
          closeness: 0,
          needsAnalysis: true,
          stats: null,
          lastUploadId: uploadId,
        });
      }
    }
    return null;
  },
});

export const pendingConversations = internalQuery({
  args: { ownerKey: v.string(), limit: v.number() },
  handler: async (ctx, { ownerKey, limit }) => {
    const rows = await ctx.db
      .query("conversations")
      .withIndex("by_ownerKey_and_needsAnalysis", (q) => q.eq("ownerKey", ownerKey).eq("needsAnalysis", true))
      .take(limit);
    return rows.map((c) => ({ key: c.key, kind: c.kind, selfName: c.selfName }));
  },
});

export const saveConversationStats = internalMutation({
  args: {
    ownerKey: v.string(),
    items: v.array(v.object({ key: v.string(), stats: conversationStatsV, closeness: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, { ownerKey, items }) => {
    for (const item of items) {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey).eq("key", item.key))
        .unique();
      if (!conversation) continue;
      await ctx.db.patch("conversations", conversation._id, {
        stats: item.stats,
        closeness: item.closeness,
        messageCount: item.stats.messages,
        lastAt: item.stats.lastAt ?? 0,
        needsAnalysis: false,
      });
    }
    return null;
  },
});

export const conversationSummaries = internalQuery({
  args: { ownerKey: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { ownerKey, paginationOpts }) => {
    const result = await ctx.db
      .query("conversations")
      .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey))
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((c) => ({
        key: c.key,
        platform: c.platform,
        kind: c.kind,
        title: c.title,
        selfName: c.selfName,
        closeness: c.closeness,
        stats: c.stats,
      })),
    };
  },
});

export const upsertPeople = internalMutation({
  args: { ownerKey: v.string(), refreshedAt: v.number(), people: v.array(personV) },
  returns: v.null(),
  handler: async (ctx, { ownerKey, refreshedAt, people }) => {
    for (const person of people) {
      const existing = await ctx.db
        .query("people")
        .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey).eq("key", person.key))
        .unique();
      if (existing) await ctx.db.replace("people", existing._id, { ...person, ownerKey, refreshedAt });
      else await ctx.db.insert("people", { ...person, ownerKey, refreshedAt });
    }
    return null;
  },
});

/** Removes people no longer present after a refresh. Returns how many were deleted (call until 0). */
export const deleteStalePeople = internalMutation({
  args: { ownerKey: v.string(), refreshedAt: v.number() },
  returns: v.number(),
  handler: async (ctx, { ownerKey, refreshedAt }) => {
    const stale = await ctx.db
      .query("people")
      .withIndex("by_ownerKey_and_refreshedAt", (q) => q.eq("ownerKey", ownerKey).lt("refreshedAt", refreshedAt))
      .take(500);
    for (const person of stale) await ctx.db.delete("people", person._id);
    return stale.length;
  },
});

export const saveInsights = internalMutation({
  args: { ownerKey: v.string(), insights: insightsV },
  returns: v.null(),
  handler: async (ctx, { ownerKey, insights }) => {
    const profile = await requireProfile(ctx, ownerKey);
    await ctx.db.patch("profiles", profile._id, { insights, updatedAt: Date.now() });
    return null;
  },
});
