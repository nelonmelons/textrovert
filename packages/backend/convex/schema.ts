import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const participant = v.object({ id: v.string(), name: v.string(), isSelf: v.boolean() });

export const chatSummary = {
  owner: v.string(),
  chatKey: v.string(),
  source: v.string(),
  title: v.union(v.string(), v.null()),
  isGroup: v.boolean(),
  participants: v.array(participant),
  messageCount: v.number(),
  fromMe: v.number(),
  fromThem: v.number(),
  recentCount: v.number(),
  firstTs: v.union(v.string(), v.null()),
  lastTs: v.union(v.string(), v.null()),
  lastMessage: v.union(v.string(), v.null()),
  score: v.number(),
};

export default defineSchema({
  imports: defineTable({
    source: v.union(v.literal("file"), v.literal("recording")),
    filename: v.optional(v.string()),
    status: v.union(v.literal("processing"), v.literal("done"), v.literal("error")),
    progress: v.optional(v.object({ done: v.number(), total: v.number() })),
    error: v.optional(v.string()),
    createdAt: v.number(),
  }),
  conversations: defineTable({
    ...chatSummary,
    importId: v.id("imports"),
    warnings: v.array(v.string()),
  })
    .index("by_import_score", ["importId", "score"])
    .index("by_owner_chat", ["owner", "chatKey"]),
  devices: defineTable({
    deviceId: v.string(),
    lastSyncAt: v.number(),
    chatCount: v.number(),
  }).index("by_device", ["deviceId"]),
  chats: defineTable({
    ...chatSummary,
    deviceId: v.string(),
    sourceId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_device_score", ["deviceId", "score"])
    .index("by_owner_chat", ["owner", "chatKey"]),
});
