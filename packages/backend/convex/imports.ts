import { v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

export const generateUploadUrl = mutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const ingestFile = mutation({
  args: { storageId: v.id("_storage"), filename: v.string(), selfName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const importId = await ctx.db.insert("imports", {
      source: "file",
      filename: args.filename,
      status: "processing",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.ingest.runFile, { importId, ...args });
    return importId;
  },
});

export const ingestRecording = mutation({
  args: {
    frames: v.array(v.object({ storageId: v.id("_storage"), timeSec: v.number() })),
    recordedAt: v.optional(v.number()),
    tzOffsetMinutes: v.optional(v.number()),
    framesPerWindow: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set on this Convex deployment. Run: npx convex env set OPENAI_API_KEY sk-...");
    }
    if (!args.frames.length) throw new Error("ingestRecording needs at least one frame.");
    const importId = await ctx.db.insert("imports", {
      source: "recording",
      status: "processing",
      progress: { done: 0, total: 0 },
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.ingest.runRecording, { importId, ...args });
    return importId;
  },
});

async function withUrls(ctx: QueryCtx, c: Doc<"conversations">) {
  return {
    ...c,
    transcriptUrl: await ctx.storage.getUrl(c.transcriptStorageId),
    conversationUrl: await ctx.storage.getUrl(c.conversationStorageId),
  };
}

export const getImport = query({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    const imp = await ctx.db.get(importId);
    if (!imp) return null;
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_import_score", (q) => q.eq("importId", importId))
      .order("desc")
      .collect();
    return { ...imp, conversations: await Promise.all(conversations.map((c) => withUrls(ctx, c))) };
  },
});

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("conversations").order("desc").take(100);
    return Promise.all(rows.map((c) => withUrls(ctx, c)));
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const c = await ctx.db.get(conversationId);
    return c && withUrls(ctx, c);
  },
});

export const setProgress = internalMutation({
  args: { importId: v.id("imports"), done: v.number(), total: v.number() },
  handler: async (ctx, { importId, done, total }) => {
    const imp = await ctx.db.get(importId);
    if (!imp || imp.status !== "processing" || (imp.progress && imp.progress.done > done)) return;
    await ctx.db.patch(importId, { progress: { done, total } });
  },
});

export const markError = internalMutation({
  args: { importId: v.id("imports"), error: v.string() },
  handler: async (ctx, { importId, error }) => {
    await ctx.db.patch(importId, { status: "error", error });
  },
});

export const saveConversation = internalMutation({
  args: {
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
  },
  handler: (ctx, args): Promise<Id<"conversations">> => ctx.db.insert("conversations", args),
});

export const markDone = internalMutation({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    await ctx.db.patch(importId, { status: "done" });
  },
});
