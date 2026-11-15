"use node";

import { ConvexError, v } from "convex/values";

import { ask as askAgent, openAiComplete, type AssistantAnswer } from "../pipeline/assistant/agent";
import { chunkMessages, openAiEmbedder } from "../pipeline/assistant/memory";
import { safeTimeZone } from "../pipeline/time";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { getMemoryIndex, getMessageStore, storeOwner } from "./messageStore";

const INDEX_BUDGET_MS = 7 * 60_000;

/**
 * Ask anything about the user's chats ("what did Emma say she wants as a gift?", "who did I talk to about Yosemite?").
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
    const [conversations, store, memory] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey: args.ownerKey }),
      getMessageStore(),
      getMemoryIndex(),
    ]);
    return await askAgent({
      question,
      history: args.history?.map((t) => ({ role: t.role, content: t.content.slice(0, 4000) })),
      conversations,
      owner: storeOwner(args.ownerKey),
      store,
      memory,
      embed: openAiEmbedder(apiKey),
      complete: openAiComplete(apiKey, process.env.ASSISTANT_MODEL || undefined),
      timeZone: safeTimeZone(profile.timeZone),
      now: Date.now(),
    });
  },
});

/**
 * Embeds every message stored since the last run, conversation by conversation, for the assistant's meaning search.
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
    const [conversations, store, memory] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey }),
      getMessageStore(),
      getMemoryIndex(),
    ]);
    const indexed = await memory.indexedUpTo(owner);
    const embed = openAiEmbedder(apiKey);
    for (const c of conversations) {
      if (Date.now() > deadline) {
        await ctx.scheduler.runAfter(0, internal.assistant.index, { ownerKey });
        return null;
      }
      const fresh = await store.storedAfter(owner, c.key, indexed.get(c.key) ?? 0);
      const chunks = chunkMessages(c.key, fresh, (sender) => (c.selfName && sender === c.selfName ? "Me" : sender));
      for (let i = 0; i < chunks.length; i += 500) await memory.add(owner, chunks.slice(i, i + 500), embed);
    }
    return null;
  },
});
