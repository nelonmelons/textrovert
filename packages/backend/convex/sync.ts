import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Conversation } from "@textrovert/ingest";
import { chatSummary } from "./schema";
import { ensureSchema, insertMessages, loadConversation, summarize } from "./lib/messageStore";
import { turso } from "./lib/turso";

export const upsertChat = internalMutation({
  args: { ...chatSummary, deviceId: v.string(), sourceId: v.string(), updatedAt: v.number() },
  handler: async (ctx, chat) => {
    const existing = await ctx.db
      .query("chats")
      .withIndex("by_owner_chat", (q) => q.eq("owner", chat.owner).eq("chatKey", chat.chatKey))
      .unique();
    if (existing) await ctx.db.patch(existing._id, chat);
    else await ctx.db.insert("chats", chat);
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
    const db = turso();
    await ensureSchema(db);
    let updated = 0;
    for (const raw of chats) {
      const incoming = JSON.parse(raw) as Conversation;
      if (!incoming.sourceId || !incoming.messages.length) continue;
      const chat = { owner: deviceId, conversation: `${incoming.source}:${incoming.sourceId}` };
      if ((await insertMessages(db, chat, incoming)) === 0) continue;
      const meta = {
        source: incoming.source,
        sourceId: incoming.sourceId,
        title: incoming.title,
        isGroup: incoming.isGroup,
        participants: incoming.participants.map(({ id, name, isSelf }) => ({ id, name, isSelf })),
      };
      const conv = await loadConversation(db, chat, meta);
      await ctx.runMutation(internal.sync.upsertChat, {
        owner: deviceId,
        chatKey: chat.conversation,
        deviceId,
        sourceId: incoming.sourceId,
        source: meta.source,
        title: meta.title,
        isGroup: meta.isGroup,
        participants: meta.participants,
        updatedAt: Date.now(),
        ...summarize(conv),
      });
      updated++;
    }
    await ctx.runMutation(internal.sync.touchDevice, { deviceId });
    return { received: chats.length, updated };
  },
});

export const listChats = query({
  args: { deviceId: v.string(), limit: v.optional(v.number()) },
  handler: (ctx, { deviceId, limit }) =>
    ctx.db
      .query("chats")
      .withIndex("by_device_score", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .take(limit ?? 50),
});

export const getDevice = query({
  args: { deviceId: v.string() },
  handler: (ctx, { deviceId }) => ctx.db.query("devices").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique(),
});
