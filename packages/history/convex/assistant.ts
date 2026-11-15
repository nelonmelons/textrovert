"use node";

import { ConvexError, v } from "convex/values";

import { ask as askAgent, openAiComplete, type AssistantAnswer } from "../pipeline/assistant/agent";
import { describeEpisode, openAiFacets, segmentEpisodes, type Episode } from "../pipeline/assistant/episodes";
import { chunkMessages, openAiEmbedder } from "../pipeline/assistant/memory";
import { safeTimeZone } from "../pipeline/time";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { getEpisodeIndex, getMemoryIndex, getMessageStore, storeOwner } from "./messageStore";

const INDEX_BUDGET_MS = 7 * 60_000;
const FACET_CONCURRENCY = 16;

/**
 * Ask anything about the user's chats ("what did Sam say they want as a gift?", "who did I talk to about Yosemite?").
 * The assistant scopes itself to the people and dates in the question and answers with citations; each citation's
 * quote is the original message text and conversationId/messageId/ts open it in context via messages.around.
 * history is the earlier turns of this chat with the assistant, oldest first.
 */
export const ask = action({
  args: {
    ownerKey: v.string(),
    question: v.string(),
    history: v.optional(v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), content: v.string() }))),
  },
  handler: async (ctx, args): Promise<AssistantAnswer> => {
    const profile = await ctx.runQuery(internal.ingestData.profile, { ownerKey: args.ownerKey });
    if (!profile) throw new ConvexError("Unknown owner key");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ConvexError("The assistant isn't configured: set OPENAI_API_KEY on the deployment");
    const question = args.question.trim().slice(0, 2000);
    if (!question) throw new ConvexError("Ask a question");
    const [conversations, store, memory, episodes] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey: args.ownerKey }),
      getMessageStore(),
      getMemoryIndex(),
      getEpisodeIndex(),
    ]);
    return await askAgent({
      question,
      history: args.history?.map((t) => ({ role: t.role, content: t.content.slice(0, 4000) })),
      conversations,
      owner: storeOwner(args.ownerKey),
      store,
      memory,
      episodes,
      embed: openAiEmbedder(apiKey),
      complete: openAiComplete(apiKey, process.env.ASSISTANT_MODEL || undefined),
      timeZone: safeTimeZone(profile.timeZone),
      now: Date.now(),
    });
  },
});

/**
 * Indexes every message stored since the last run, conversation by conversation: chunk embeddings for meaning search,
 * and episodes (summaries with facets and grounded plans) for the topic, grouping and plan tools.
 * Scheduled after each upload's analysis; reschedules itself when it runs long.
 */
export const index = internalAction({
  args: { ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerKey }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const deadline = Date.now() + INDEX_BUDGET_MS;
    const owner = storeOwner(ownerKey);
    const [conversations, store, memory, episodeIndex, profile] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey }),
      getMessageStore(),
      getMemoryIndex(),
      getEpisodeIndex(),
      ctx.runQuery(internal.ingestData.profile, { ownerKey }),
    ]);
    const [indexed, episodesUpTo] = await Promise.all([memory.indexedUpTo(owner), episodeIndex.indexedUpTo(owner)]);
    const embed = openAiEmbedder(apiKey);
    const extract = openAiFacets(apiKey);
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimeZone(profile?.timeZone ?? "UTC"),
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    for (const c of conversations) {
      if (Date.now() > deadline) {
        await ctx.scheduler.runAfter(0, internal.assistant.index, { ownerKey });
        return null;
      }
      const label = (sender: string) => (c.selfName && sender === c.selfName ? "Me" : sender);
      const fresh = await store.storedAfter(owner, c.key, indexed.get(c.key) ?? 0);
      const chunks = chunkMessages(c.key, fresh, label);
      for (let i = 0; i < chunks.length; i += 500) await memory.add(owner, chunks.slice(i, i + 500), embed);

      const unsummarized = await store.storedAfter(owner, c.key, episodesUpTo.get(c.key) ?? 0);
      const segments = segmentEpisodes(unsummarized);
      for (let i = 0; i < segments.length; i += FACET_CONCURRENCY * 4) {
        const batch = segments.slice(i, i + FACET_CONCURRENCY * 4);
        const described: (Episode | null)[] = [];
        for (let j = 0; j < batch.length; j += FACET_CONCURRENCY) {
          described.push(...(await Promise.all(batch.slice(j, j + FACET_CONCURRENCY).map((s) => describeEpisode(c.key, s, label, (ts) => stamp.format(ts), extract)))));
        }
        await episodeIndex.add(owner, described.filter((e): e is Episode => e !== null), embed);
      }
    }
    return null;
  },
});
