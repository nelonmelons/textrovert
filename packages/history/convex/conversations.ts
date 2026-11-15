import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalQuery, query } from "./_generated/server";
import { platformV } from "./validators";

/**
 * The user's conversations, newest activity first by default. sort: "recent" | "messages" | "closeness".
 * Filtering by platform always sorts by recent activity. Items are trimmed; use conversations.get for full stats.
 */
export const list = query({
  args: {
    ownerKey: v.string(),
    sort: v.optional(v.union(v.literal("recent"), v.literal("messages"), v.literal("closeness"))),
    platform: v.optional(platformV),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { ownerKey, sort = "recent", platform, paginationOpts }) => {
    const table = ctx.db.query("conversations");
    const ordered = platform
      ? table.withIndex("by_ownerKey_and_platform_and_lastAt", (q) => q.eq("ownerKey", ownerKey).eq("platform", platform))
      : sort === "messages"
        ? table.withIndex("by_ownerKey_and_messageCount", (q) => q.eq("ownerKey", ownerKey))
        : sort === "closeness"
          ? table.withIndex("by_ownerKey_and_closeness", (q) => q.eq("ownerKey", ownerKey))
          : table.withIndex("by_ownerKey_and_lastAt", (q) => q.eq("ownerKey", ownerKey));
    const result = await ordered.order("desc").paginate(paginationOpts);
    return { ...result, page: result.page.map(listItem) };
  },
});

/** One conversation with its full stats (participants, heatmaps, reply times, top words and emojis). */
export const get = query({
  args: { ownerKey: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { ownerKey, conversationId }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    return conversation && conversation.ownerKey === ownerKey ? conversation : null;
  },
});

export const forOwner = internalQuery({
  args: { ownerKey: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { ownerKey, conversationId }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    return conversation && conversation.ownerKey === ownerKey ? conversation : null;
  },
});

export const byKeys = internalQuery({
  args: { ownerKey: v.string(), keys: v.array(v.string()) },
  handler: async (ctx, { ownerKey, keys }) => {
    const found = [];
    for (const key of keys.slice(0, 200)) {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey).eq("key", key))
        .unique();
      if (conversation) {
        found.push({
          _id: conversation._id,
          key: conversation.key,
          title: conversation.title,
          platform: conversation.platform,
          kind: conversation.kind,
          selfName: conversation.selfName,
        });
      }
    }
    return found;
  },
});

/** Every conversation of the owner, newest activity first, as the assistant's directory of chats. */
export const directory = internalQuery({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const rows = await ctx.db
      .query("conversations")
      .withIndex("by_ownerKey_and_lastAt", (q) => q.eq("ownerKey", ownerKey))
      .order("desc")
      .take(2000);
    return rows.map((c) => ({
      id: c._id as string,
      key: c.key,
      title: c.title,
      platform: c.platform,
      kind: c.kind,
      participants: c.participants.slice(0, 30),
      selfName: c.selfName,
      messageCount: c.messageCount,
      lastAt: c.lastAt,
    }));
  },
});

function listItem(c: Doc<"conversations">) {
  return {
    _id: c._id,
    platform: c.platform,
    kind: c.kind,
    title: c.title,
    participants: c.participants.slice(0, 5),
    participantCount: c.stats?.participantCount ?? c.participants.length,
    messageCount: c.messageCount,
    myMessages: c.stats?.myMessages ?? null,
    firstAt: c.stats?.firstAt ?? null,
    lastAt: c.lastAt || null,
    closeness: c.closeness,
    analyzed: !c.needsAnalysis,
    topEmojis: c.stats?.topEmojis.slice(0, 3) ?? [],
  };
}
