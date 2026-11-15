import { v } from "convex/values";
import { action, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { renderTranscript } from "@textrovert/ingest";
import { getMessagePage, loadConversation, searchMessages, type SearchHit } from "./lib/messageStore";
import { turso } from "./lib/turso";

const chatArgs = { owner: v.string(), chatKey: v.string() };

export const chatMeta = internalQuery({
  args: chatArgs,
  handler: async (ctx, { owner, chatKey }) =>
    (await ctx.db.query("chats").withIndex("by_owner_chat", (q) => q.eq("owner", owner).eq("chatKey", chatKey)).unique()) ??
    (await ctx.db.query("conversations").withIndex("by_owner_chat", (q) => q.eq("owner", owner).eq("chatKey", chatKey)).unique()),
});

async function requireChat(ctx: ActionCtx, owner: string, chatKey: string) {
  const meta = await ctx.runQuery(internal.messages.chatMeta, { owner, chatKey });
  if (!meta) throw new Error(`Unknown chat ${owner} / ${chatKey}`);
  return meta;
}

export const getMessages = action({
  args: { ...chatArgs, offset: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { owner, chatKey, offset, limit }) => {
    await requireChat(ctx, owner, chatKey);
    return getMessagePage(turso(), { owner, conversation: chatKey }, offset ?? 0, Math.min(limit ?? 200, 1000));
  },
});

export const getTranscript = action({
  args: chatArgs,
  handler: async (ctx, { owner, chatKey }): Promise<string> => {
    const meta = await requireChat(ctx, owner, chatKey);
    const conv = await loadConversation(turso(), { owner, conversation: chatKey }, {
      source: meta.source as "imessage",
      title: meta.title,
      isGroup: meta.isGroup,
      participants: meta.participants,
    });
    return renderTranscript(conv);
  },
});

export const search = action({
  args: { owner: v.string(), query: v.string(), chatKeys: v.array(v.string()), limit: v.optional(v.number()) },
  handler: (_ctx, { owner, query, chatKeys, limit }): Promise<SearchHit[]> =>
    searchMessages(turso(), owner, query, chatKeys, Math.min(limit ?? 50, 200)),
});
