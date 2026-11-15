import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    importId: v.id("imports"),
    source: v.string(),
    title: v.union(v.string(), v.null()),
    isGroup: v.boolean(),
    participants: v.array(v.object({ id: v.string(), name: v.string(), isSelf: v.boolean() })),
    messageCount: v.number(),
    firstTs: v.union(v.string(), v.null()),
    lastTs: v.union(v.string(), v.null()),
    warnings: v.array(v.string()),
    fromMe: v.number(),
    fromThem: v.number(),
    recentCount: v.number(),
    lastMessage: v.union(v.string(), v.null()),
    score: v.number(),
    transcriptStorageId: v.id("_storage"),
    conversationStorageId: v.id("_storage"),
  })
    .index("by_import", ["importId"])
    .index("by_import_score", ["importId", "score"]),
  devices: defineTable({
    deviceId: v.string(),
    lastSyncAt: v.number(),
    chatCount: v.number(),
  }).index("by_device", ["deviceId"]),
  chats: defineTable({
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
  })
    .index("by_device_source", ["deviceId", "source", "sourceId"])
    .index("by_device_score", ["deviceId", "score"]),
});
