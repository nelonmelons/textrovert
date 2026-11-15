import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { chatSummary } from "./schema";

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
    return { ...imp, conversations };
  },
});

export const listConversations = query({
  args: {},
  handler: (ctx) => ctx.db.query("conversations").order("desc").take(100),
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: (ctx, { conversationId }) => ctx.db.get(conversationId),
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
  args: { ...chatSummary, importId: v.id("imports"), warnings: v.array(v.string()) },
  handler: (ctx, args): Promise<Id<"conversations">> => ctx.db.insert("conversations", args),
});

export const markDone = internalMutation({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    await ctx.db.patch(importId, { status: "done" });
  },
});
