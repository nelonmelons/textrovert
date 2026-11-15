import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { conversationKindV, conversationStatsV, insightsV, personV, platformV, uploadStatusV } from "./validators";

export const uploadProgressV = v.object({
  messagesParsed: v.number(),
  messagesStored: v.number(),
  conversations: v.number(),
  conversationsAnalyzed: v.number(),
});

export const uploadSourceV = v.object({
  platform: platformV,
  files: v.number(),
  conversations: v.number(),
  messages: v.number(),
});

// Convex holds everything the app renders reactively. The full message history lives in the
// Turso message store (pipeline/store.ts) and is read through the actions in messages.ts.
export default defineSchema({
  // One per device/user. ownerKey is a secret minted by owners.create that scopes every other row.
  profiles: defineTable({
    ownerKey: v.string(),
    timeZone: v.string(),
    // Sender names known to be the user, used to tell "me" apart in exports that don't say.
    selfNames: v.array(v.string()),
    insights: v.union(insightsV, v.null()),
    updatedAt: v.number(),
  }).index("by_ownerKey", ["ownerKey"]),

  // One per uploaded export; the app watches status and progress live.
  uploads: defineTable({
    ownerKey: v.string(),
    // Raw export in Convex file storage; deleted once its messages are in the message store.
    storageId: v.union(v.id("_storage"), v.null()),
    fileName: v.string(),
    fileSize: v.union(v.number(), v.null()),
    timeZone: v.string(),
    selfName: v.union(v.string(), v.null()),
    status: uploadStatusV,
    progress: uploadProgressV,
    sources: v.array(uploadSourceV),
    warnings: v.array(v.string()),
    error: v.union(v.string(), v.null()),
    // Bumped on every status or progress write; uploads.watchdog fails an upload that goes quiet.
    updatedAt: v.number(),
    finishedAt: v.union(v.number(), v.null()),
  }).index("by_ownerKey", ["ownerKey"]),

  // One per chat thread per platform. `key` links to the conversation's rows in the message store.
  conversations: defineTable({
    ownerKey: v.string(),
    key: v.string(),
    platform: platformV,
    kind: conversationKindV,
    title: v.string(),
    selfName: v.union(v.string(), v.null()),
    participants: v.array(v.string()),
    messageCount: v.number(),
    lastAt: v.number(),
    closeness: v.number(),
    needsAnalysis: v.boolean(),
    stats: v.union(conversationStatsV, v.null()),
    lastUploadId: v.id("uploads"),
  })
    .index("by_ownerKey_and_key", ["ownerKey", "key"])
    .index("by_ownerKey_and_lastAt", ["ownerKey", "lastAt"])
    .index("by_ownerKey_and_messageCount", ["ownerKey", "messageCount"])
    .index("by_ownerKey_and_closeness", ["ownerKey", "closeness"])
    .index("by_ownerKey_and_platform_and_lastAt", ["ownerKey", "platform", "lastAt"])
    .index("by_ownerKey_and_needsAnalysis", ["ownerKey", "needsAnalysis"]),

  // Everyone the user talks to, merged across platforms by name and ranked by closeness.
  people: defineTable(personV.extend({ ownerKey: v.string(), refreshedAt: v.number() }))
    .index("by_ownerKey_and_key", ["ownerKey", "key"])
    .index("by_ownerKey_and_closeness", ["ownerKey", "closeness"])
    .index("by_ownerKey_and_refreshedAt", ["ownerKey", "refreshedAt"]),
});
