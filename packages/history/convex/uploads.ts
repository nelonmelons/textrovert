import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { requireProfile } from "./lib/owner";
import { uploadProgressV, uploadSourceV } from "./schema";
import { uploadStatusV } from "./validators";

const WATCHDOG_INTERVAL_MS = 5 * 60_000;
// Longer than an action can run (10 minutes), so a stage that hasn't reported for this long has died.
const STALLED_AFTER_MS = 11 * 60_000;

/** Step 1 of an upload: a short-lived URL the phone POSTs the export file to. */
export const generateUploadUrl = mutation({
  args: { ownerKey: v.string() },
  returns: v.string(),
  handler: async (ctx, { ownerKey }) => {
    await requireProfile(ctx, ownerKey);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2: registers the uploaded file and starts the pipeline. Returns the upload id to watch with uploads.get.
 * timeZone is the phone's IANA zone (WhatsApp timestamps have none, and hour-of-day stats need one).
 * selfName optionally tells the pipeline which sender is the user, for exports that don't say.
 */
export const start = mutation({
  args: {
    ownerKey: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    timeZone: v.string(),
    selfName: v.optional(v.string()),
  },
  returns: v.id("uploads"),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.ownerKey);
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new ConvexError("Uploaded file not found");
    const selfName = args.selfName?.trim().slice(0, 100) || null;
    const timeZone = args.timeZone.trim().slice(0, 64) || profile.timeZone;
    await ctx.db.patch("profiles", profile._id, {
      timeZone,
      selfNames:
        selfName && !profile.selfNames.includes(selfName) ? [...profile.selfNames, selfName].slice(-20) : profile.selfNames,
      updatedAt: Date.now(),
    });
    const uploadId = await ctx.db.insert("uploads", {
      ownerKey: args.ownerKey,
      storageId: args.storageId,
      fileName: args.fileName.slice(0, 200),
      fileSize: file.size,
      timeZone,
      selfName,
      status: "queued",
      progress: { messagesParsed: 0, messagesStored: 0, conversations: 0, conversationsAnalyzed: 0 },
      sources: [],
      warnings: [],
      error: null,
      updatedAt: Date.now(),
      finishedAt: null,
    });
    await ctx.scheduler.runAfter(0, internal.ingest.run, { uploadId });
    await ctx.scheduler.runAfter(WATCHDOG_INTERVAL_MS, internal.uploads.watchdog, { uploadId });
    return uploadId;
  },
});

const MAX_RECORDING_FRAMES = 600;

/**
 * Screen-recording variant of start: the phone samples frames from a recording of a chat (scrolling up through it),
 * uploads each one via generateUploadUrl, then registers them here in time order. Frames are read by a vision
 * model, stitched into one chat, and stored like any export. Watch the returned upload id with uploads.get.
 */
export const startRecording = mutation({
  args: {
    ownerKey: v.string(),
    frames: v.array(v.object({ storageId: v.id("_storage"), timeSec: v.number() })),
    recordedAt: v.number(),
    timeZone: v.string(),
  },
  returns: v.id("uploads"),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.ownerKey);
    if (args.frames.length === 0 || args.frames.length > MAX_RECORDING_FRAMES) {
      throw new ConvexError("A recording needs between 1 and " + MAX_RECORDING_FRAMES + " frames");
    }
    const timeZone = args.timeZone.trim().slice(0, 64) || profile.timeZone;
    const uploadId = await ctx.db.insert("uploads", {
      ownerKey: args.ownerKey,
      storageId: null,
      frames: [...args.frames].sort((a, b) => a.timeSec - b.timeSec),
      recordedAt: args.recordedAt,
      fileName: "Screen recording",
      fileSize: null,
      timeZone,
      selfName: null,
      status: "queued",
      progress: { messagesParsed: 0, messagesStored: 0, conversations: 0, conversationsAnalyzed: 0 },
      sources: [],
      warnings: [],
      error: null,
      updatedAt: Date.now(),
      finishedAt: null,
    });
    await ctx.scheduler.runAfter(0, internal.ingest.runRecording, { uploadId });
    await ctx.scheduler.runAfter(WATCHDOG_INTERVAL_MS, internal.uploads.watchdog, { uploadId });
    return uploadId;
  },
});

/** Live status of one upload: queued → parsing → analyzing → done (or failed, with error). */
export const get = query({
  args: { ownerKey: v.string(), uploadId: v.id("uploads") },
  handler: async (ctx, { ownerKey, uploadId }) => {
    const upload = await ctx.db.get("uploads", uploadId);
    return upload && upload.ownerKey === ownerKey ? upload : null;
  },
});

export const list = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    return await ctx.db
      .query("uploads")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
      .order("desc")
      .take(20);
  },
});

export const load = internalQuery({
  args: { uploadId: v.id("uploads") },
  handler: async (ctx, { uploadId }) => await ctx.db.get("uploads", uploadId),
});

export const update = internalMutation({
  args: {
    uploadId: v.id("uploads"),
    status: v.optional(uploadStatusV),
    progress: v.optional(uploadProgressV),
    sources: v.optional(v.array(uploadSourceV)),
    warnings: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { uploadId, ...fields }) => {
    const upload = await ctx.db.get("uploads", uploadId);
    if (!upload || isFinished(upload)) return null;
    await patchUpload(ctx, upload, fields);
    return null;
  },
});

/** Fails an upload whose pipeline action died (timeout, out of memory) instead of leaving it spinning forever. */
export const watchdog = internalMutation({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get("uploads", uploadId);
    if (!upload || isFinished(upload)) return null;
    if (Date.now() - upload.updatedAt < STALLED_AFTER_MS) {
      await ctx.scheduler.runAfter(WATCHDOG_INTERVAL_MS, internal.uploads.watchdog, { uploadId });
      return null;
    }
    await patchUpload(ctx, upload, {
      status: "failed",
      error: "Processing stopped unexpectedly, most likely because the export is too big to handle in one go. Try exporting without media, or fewer chats at a time.",
    });
    return null;
  },
});

function isFinished(upload: Doc<"uploads">): boolean {
  return upload.status === "done" || upload.status === "failed";
}

async function patchUpload(
  ctx: MutationCtx,
  upload: Doc<"uploads">,
  fields: Partial<Pick<Doc<"uploads">, "status" | "progress" | "sources" | "warnings" | "error">>,
) {
  const finished = fields.status === "done" || fields.status === "failed";
  await ctx.db.patch("uploads", upload._id, {
    ...fields,
    updatedAt: Date.now(),
    ...(finished ? { finishedAt: Date.now(), storageId: null, frames: [] } : {}),
  });
  // The raw export is never kept once processing ends: its messages are in the message store, or it failed.
  if (!finished) return;
  if (upload.storageId) await ctx.storage.delete(upload.storageId);
  for (const frame of upload.frames ?? []) await ctx.storage.delete(frame.storageId);
  await ctx.scheduler.runAfter(0, internal.interests.historyChanged, { ownerKey: upload.ownerKey });
}
