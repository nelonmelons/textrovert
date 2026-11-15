import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  extractWindow,
  framesToConversation,
  ingestText,
  ingestZip,
  rankConversations,
  renderTranscript,
  type ChatSummary,
  type Conversation,
  type FrameExtraction,
} from "@textrovert/ingest";

const OVERLAP_FRAMES = 2;
const CONCURRENCY = 8;

async function saveResults(ctx: ActionCtx, importId: Id<"imports">, convs: Conversation[]) {
  const ranked = rankConversations(convs);
  for (const summary of ranked) await saveResult(ctx, importId, convs[summary.index], summary);
  await ctx.runMutation(internal.imports.markDone, { importId });
}

async function saveResult(ctx: ActionCtx, importId: Id<"imports">, conv: Conversation, summary: ChatSummary) {
  const transcriptStorageId = await ctx.storage.store(new Blob([renderTranscript(conv)], { type: "text/plain; charset=utf-8" }));
  const conversationStorageId = await ctx.storage.store(new Blob([JSON.stringify(conv)], { type: "application/json" }));
  const timed = conv.messages.filter((m) => m.ts);
  await ctx.runMutation(internal.imports.saveConversation, {
    importId,
    source: conv.source,
    title: conv.title,
    isGroup: conv.isGroup,
    participants: conv.participants.map(({ id, name, isSelf }) => ({ id, name, isSelf })),
    messageCount: conv.messages.length,
    firstTs: timed[0]?.ts ?? null,
    lastTs: timed[timed.length - 1]?.ts ?? null,
    warnings: conv.warnings,
    fromMe: summary.fromMe,
    fromThem: summary.fromThem,
    recentCount: summary.recentCount,
    lastMessage: summary.lastMessage,
    score: summary.score,
    transcriptStorageId,
    conversationStorageId,
  });
}

async function failImport(ctx: ActionCtx, importId: Id<"imports">, err: unknown) {
  await ctx.runMutation(internal.imports.markError, {
    importId,
    error: err instanceof Error ? err.message : String(err),
  });
}

export const runFile = internalAction({
  args: { importId: v.id("imports"), storageId: v.id("_storage"), filename: v.string(), selfName: v.optional(v.string()) },
  handler: async (ctx, { importId, storageId, filename, selfName }) => {
    try {
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new Error(`Uploaded file ${storageId} not found in storage.`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      const convs = isZip ? ingestZip(bytes, { selfName }) : [ingestText(new TextDecoder().decode(bytes), { selfName })];
      await saveResults(ctx, importId, convs);
    } catch (err) {
      await failImport(ctx, importId, err);
    }
  },
});

function isPrivateHost(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local");
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let k = 0; k < bytes.length; k += 0x8000) binary += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

export const runRecording = internalAction({
  args: {
    importId: v.id("imports"),
    frames: v.array(v.object({ storageId: v.id("_storage"), timeSec: v.number() })),
    recordedAt: v.optional(v.number()),
    tzOffsetMinutes: v.optional(v.number()),
    framesPerWindow: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { importId } = args;
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set on this Convex deployment. Run: npx convex env set OPENAI_API_KEY sk-...");
      const size = Math.max(OVERLAP_FRAMES + 1, Math.round(args.framesPerWindow ?? 10));
      const frames = [...args.frames].sort((a, b) => a.timeSec - b.timeSec);

      const windows: (typeof frames)[] = [];
      for (let start = 0; start < frames.length; start += size - OVERLAP_FRAMES) {
        windows.push(frames.slice(start, start + size));
        if (start + size >= frames.length) break;
      }
      await ctx.runMutation(internal.imports.setProgress, { importId, done: 0, total: windows.length });

      const imageUrl = async (storageId: Id<"_storage">) => {
        const url = await ctx.storage.getUrl(storageId);
        if (!url) throw new Error(`Frame ${storageId} not found in storage.`);
        if (!isPrivateHost(url)) return url;
        const blob = await ctx.storage.get(storageId);
        if (!blob) throw new Error(`Frame ${storageId} not found in storage.`);
        return toDataUrl(blob);
      };

      const results: FrameExtraction[] = new Array(windows.length);
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < windows.length) {
          const k = next++;
          const inputs = await Promise.all(
            windows[k].map(async (f, j) => ({ frame: k * 100 + j, timeSec: f.timeSec, imageUrl: await imageUrl(f.storageId) })),
          );
          results[k] = { ...(await extractWindow(inputs, { apiKey })), frame: k };
          await ctx.runMutation(internal.imports.setProgress, { importId, done: ++done, total: windows.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, windows.length) }, worker));

      const recordedAt = args.recordedAt ?? Date.now();
      const conv = framesToConversation(results, {
        recordedAt: new Date(recordedAt - (args.tzOffsetMinutes ?? 0) * 60_000),
      });
      await saveResults(ctx, importId, [conv]);
    } catch (err) {
      await failImport(ctx, importId, err);
    }
  },
});
