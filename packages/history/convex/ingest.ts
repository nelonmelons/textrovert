"use node";

import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { v } from "convex/values";

import { analyzeStoredConversations, type AnalysisTarget } from "../pipeline/analyze";
import { openArchive } from "../pipeline/archive";
import { ingestArchive } from "../pipeline/ingest";
import { buildInsights, buildPeople, type ConversationSummary } from "../pipeline/insights";
import { LocalTime, safeTimeZone } from "../pipeline/time";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { getMessageStore, storeOwner } from "./messageStore";

const ANALYSIS_BUDGET_MS = 7 * 60_000;
const ANALYSIS_BATCH = 40;

/**
 * Stage 1: download the export, detect and parse every chat in it, and write all messages to the message store.
 * Hands off to `analyze` so each stage gets its own action time budget.
 */
export const run = internalAction({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.runQuery(internal.uploads.load, { uploadId });
    if (!upload || upload.status !== "queued" || !upload.storageId) return null;
    await ctx.runMutation(internal.uploads.update, { uploadId, status: "parsing" });
    const dir = await mkdtemp(join(tmpdir(), "upload-"));
    try {
      const url = await ctx.storage.getUrl(upload.storageId);
      if (!url) throw new Error("The uploaded file is missing");
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error("Couldn't download the upload (HTTP " + response.status + ")");
      const filePath = join(dir, "upload");
      await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), createWriteStream(filePath));

      const store = await getMessageStore();
      const profile = await ctx.runQuery(internal.ingestData.profile, { ownerKey: upload.ownerKey });
      const archive = await openArchive(filePath, upload.fileName);
      try {
        const result = await ingestArchive({
          owner: storeOwner(upload.ownerKey),
          archive,
          store,
          timeZone: safeTimeZone(upload.timeZone),
          selfNames: [...(profile?.selfNames ?? []), ...(upload.selfName ? [upload.selfName] : [])],
          onProgress: (p) =>
            ctx.runMutation(internal.uploads.update, { uploadId, progress: { ...p, conversationsAnalyzed: 0 } }),
        });
        for (let i = 0; i < result.conversations.length; i += 100) {
          await ctx.runMutation(internal.ingestData.upsertConversations, {
            ownerKey: upload.ownerKey,
            uploadId,
            conversations: result.conversations.slice(i, i + 100).map((c) => ({
              key: c.key,
              platform: c.platform,
              kind: c.kind,
              title: c.title.slice(0, 200),
              selfName: c.selfName,
              participants: c.participants.slice(0, 100),
              parsed: c.parsed,
            })),
          });
        }
        if (result.learnedSelfNames.length > 0) {
          await ctx.runMutation(internal.ingestData.rememberSelfNames, {
            ownerKey: upload.ownerKey,
            names: result.learnedSelfNames,
          });
        }
        await ctx.runMutation(internal.uploads.update, {
          uploadId,
          status: "analyzing",
          sources: result.sources,
          warnings: result.warnings,
          progress: {
            messagesParsed: result.messagesParsed,
            messagesStored: result.messagesStored,
            conversations: result.conversations.length,
            conversationsAnalyzed: 0,
          },
        });
        await ctx.scheduler.runAfter(0, internal.ingest.analyze, { uploadId });
      } finally {
        await archive.close();
      }
    } catch (error) {
      await fail(ctx, uploadId, error);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    return null;
  },
});

/**
 * Stage 2: re-read every conversation touched by new data from the message store (so stats always cover the
 * full deduplicated history), then rebuild people and profile insights. Reschedules itself if it runs long.
 */
export const analyze = internalAction({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.runQuery(internal.uploads.load, { uploadId });
    if (!upload || upload.status !== "analyzing") return null;
    const { ownerKey } = upload;
    try {
      const deadline = Date.now() + ANALYSIS_BUDGET_MS;
      const store = await getMessageStore();
      const local = new LocalTime(safeTimeZone(upload.timeZone));
      const now = Date.now();
      let analyzed = upload.progress.conversationsAnalyzed;
      const seen = new Set<string>();
      for (;;) {
        const pending: AnalysisTarget[] = await ctx.runQuery(internal.ingestData.pendingConversations, {
          ownerKey,
          limit: ANALYSIS_BATCH,
        });
        // Anything already analyzed in this run was re-queued by a concurrent upload, whose own run picks it up.
        const fresh = pending.filter((c) => !seen.has(c.key));
        if (fresh.length === 0) break;
        if (Date.now() > deadline) {
          await ctx.scheduler.runAfter(0, internal.ingest.analyze, { uploadId });
          return null;
        }
        fresh.forEach((c) => seen.add(c.key));
        const results = [];
        for await (const result of analyzeStoredConversations(store, storeOwner(ownerKey), fresh, local, now)) results.push(result);
        for (let i = 0; i < results.length; i += 10) {
          await ctx.runMutation(internal.ingestData.saveConversationStats, { ownerKey, items: results.slice(i, i + 10) });
        }
        analyzed += results.length;
        await ctx.runMutation(internal.uploads.update, {
          uploadId,
          progress: { ...upload.progress, conversationsAnalyzed: analyzed },
        });
      }

      const summaries: ConversationSummary[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: { page: ConversationSummary[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(
          internal.ingestData.conversationSummaries,
          { ownerKey, paginationOpts: { numItems: 100, cursor } },
        );
        summaries.push(...page.page);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      const people = buildPeople(summaries);
      const refreshedAt = Date.now();
      for (let i = 0; i < people.length; i += 100) {
        await ctx.runMutation(internal.ingestData.upsertPeople, { ownerKey, refreshedAt, people: people.slice(i, i + 100) });
      }
      while ((await ctx.runMutation(internal.ingestData.deleteStalePeople, { ownerKey, refreshedAt })) > 0) {
        // keep deleting stale people
      }
      await ctx.runMutation(internal.ingestData.saveInsights, { ownerKey, insights: buildInsights(summaries, people, now) });
      await ctx.runMutation(internal.uploads.update, { uploadId, status: "done" });
    } catch (error) {
      await fail(ctx, uploadId, error);
    }
    return null;
  },
});

async function fail(ctx: ActionCtx, uploadId: Id<"uploads">, error: unknown) {
  console.error("upload " + uploadId + " failed", error);
  await ctx.runMutation(internal.uploads.update, {
    uploadId,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  });
}
