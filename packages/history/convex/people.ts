import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { query } from "./_generated/server";

/** Everyone the user talks to, merged across platforms, closest first. */
export const list = query({
  args: { ownerKey: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { ownerKey, paginationOpts }) => {
    return await ctx.db
      .query("people")
      .withIndex("by_ownerKey_and_closeness", (q) => q.eq("ownerKey", ownerKey))
      .order("desc")
      .paginate(paginationOpts);
  },
});

/** One person plus the conversations they appear in (1:1 chats first). */
export const get = query({
  args: { ownerKey: v.string(), personId: v.id("people") },
  handler: async (ctx, { ownerKey, personId }) => {
    const person = await ctx.db.get("people", personId);
    if (!person || person.ownerKey !== ownerKey) return null;
    const conversations = [];
    for (const key of person.conversationKeys) {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey).eq("key", key))
        .unique();
      if (conversation) {
        conversations.push({
          _id: conversation._id,
          platform: conversation.platform,
          kind: conversation.kind,
          title: conversation.title,
          messageCount: conversation.messageCount,
          lastAt: conversation.lastAt || null,
          closeness: conversation.closeness,
        });
      }
    }
    return { ...person, conversations };
  },
});
