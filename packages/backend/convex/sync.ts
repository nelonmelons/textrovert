import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mergeConversations, rankConversations, renderTranscript, type Conversation } from "@textrovert/ingest";

const chatFields = {
  deviceId: v.string(),
  source: v.string(),
  sourceId: v.string(),
  title: v.union(v.string(), v.null()),
  isGroup: v.boolean(),
  participants: v.array(v.object({ id: v.string(), name: v.string(), isSelf: v.boolean() })),
  messageCount: v.number(),
  fromMe: v.number(),
  fromThem: v.number(),
  recentCount: v.number(),
  firstTs: v.union(v.string(), v.null()),
  lastTs: v.union(v.string(), v.null()),
  lastMessage: v.union(v.string(), v.null()),
  score: v.number(),
  updatedAt: v.number(),
  transcriptStorageId: v.id("_storage"),
  conversationStorageId: v.id("_storage"),
};

export const findChat = internalQuery({
  args: { deviceId: v.string(), source: v.string(), sourceId: v.string() },
  handler: (ctx, { deviceId, source, sourceId }) =>
    ctx.db
      .query("chats")
      .withIndex("by_device_source", (q) => q.eq("deviceId", deviceId).eq("source", source).eq("sourceId", sourceId))
      .unique(),
});

export const upsertChat = internalMutation({
  args: chatFields,
  handler: async (ctx, chat) => {
    const existing = await ctx.db
      .query("chats")
      .withIndex("by_device_source", (q) => q.eq("deviceId", chat.deviceId).eq("source", chat.source).eq("sourceId", chat.sourceId))
      .unique();
    if (!existing) return ctx.db.insert("chats", chat);
    await ctx.db.patch(existing._id, chat);
    await ctx.storage.delete(existing.transcriptStorageId);
    await ctx.storage.delete(existing.conversationStorageId);
    return existing._id;
  },
});

export const touchDevice = internalMutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const chatCount = (await ctx.db.query("chats").withIndex("by_device_score", (q) => q.eq("deviceId", deviceId)).collect()).length;
    const device = await ctx.db.query("devices").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique();
    if (device) await ctx.db.patch(device._id, { lastSyncAt: Date.now(), chatCount });
    else await ctx.db.insert("devices", { deviceId, lastSyncAt: Date.now(), chatCount });
  },
});

export const pushChats = action({
  args: { deviceId: v.string(), chats: v.array(v.string()) },
  handler: async (ctx, { deviceId, chats }) => {
    let updated = 0;
    for (const raw of chats) {
      const incoming = JSON.parse(raw) as Conversation;
      if (!incoming.sourceId || !incoming.messages.length) continue;
      const existing = await ctx.runQuery(internal.sync.findChat, { deviceId, source: incoming.source, sourceId: incoming.sourceId });
      const stored = existing && (await ctx.storage.get(existing.conversationStorageId));
      const conv = stored ? mergeConversations(JSON.parse(await stored.text()) as Conversation, incoming) : incoming;
      if (existing && conv.messages.length === existing.messageCount) continue;
      const [summary] = rankConversations([conv]);
      const timed = conv.messages.filter((m) => m.ts);
      await ctx.runMutation(internal.sync.upsertChat, {
        deviceId,
        source: conv.source,
        sourceId: incoming.sourceId,
        title: conv.title,
        isGroup: conv.isGroup,
        participants: conv.participants.map(({ id, name, isSelf }) => ({ id, name, isSelf })),
        messageCount: conv.messages.length,
        fromMe: summary?.fromMe ?? 0,
        fromThem: summary?.fromThem ?? 0,
        recentCount: summary?.recentCount ?? 0,
        firstTs: timed[0]?.ts ?? null,
        lastTs: timed[timed.length - 1]?.ts ?? null,
        lastMessage: summary?.lastMessage ?? null,
        score: summary?.score ?? 0,
        updatedAt: Date.now(),
        transcriptStorageId: await ctx.storage.store(new Blob([renderTranscript(conv)], { type: "text/plain; charset=utf-8" })),
        conversationStorageId: await ctx.storage.store(new Blob([JSON.stringify(conv)], { type: "application/json" })),
      });
      updated++;
    }
    await ctx.runMutation(internal.sync.touchDevice, { deviceId });
    return { received: chats.length, updated };
  },
});

async function withUrls(ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } }, c: Doc<"chats">) {
  return { ...c, transcriptUrl: await ctx.storage.getUrl(c.transcriptStorageId), conversationUrl: await ctx.storage.getUrl(c.conversationStorageId) };
}

export const listChats = query({
  args: { deviceId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { deviceId, limit }) => {
    const rows = await ctx.db
      .query("chats")
      .withIndex("by_device_score", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .take(limit ?? 50);
    return Promise.all(rows.map((c) => withUrls(ctx, c)));
  },
});

export const getDevice = query({
  args: { deviceId: v.string() },
  handler: (ctx, { deviceId }) => ctx.db.query("devices").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique(),
});
