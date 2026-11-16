"use node";

import { v } from "convex/values";

import { findCommonGround } from "../pipeline/commonGround";
import { buildInterestProfile, loadOwnMessages, type ChatSource } from "../pipeline/interests";
import { openAiLlm, type Llm } from "../pipeline/llm";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { getMessageStore, storeOwner } from "./messageStore";

/** Reads every message the user sent to people and builds their interest profile from it. */
export const buildProfile = internalAction({
  args: { ownerKey: v.string(), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { ownerKey, startedAt }) => {
    const { latestAt } = await ctx.runQuery(internal.interests.history, { ownerKey });
    try {
      const llm = openAi();
      const store = await getMessageStore();
      const messages = await loadOwnMessages(store, storeOwner(ownerKey), await loadChats(ctx, ownerKey));
      const profile = await buildInterestProfile(messages, llm);
      await ctx.runMutation(internal.interests.save, { ownerKey, startedAt, historyAt: latestAt, ...profile });
    } catch (error) {
      console.error("interest profile failed", error);
      await ctx.runMutation(internal.interests.fail, { ownerKey, startedAt, historyAt: latestAt, error: errorMessage(error) });
    }
    return null;
  },
});

/** Compares the two interest profiles of a match and saves what the two people have in common. */
export const compare = internalAction({
  args: { matchId: v.id("matches"), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { matchId, startedAt }) => {
    const input = await ctx.runQuery(internal.matches.forCompare, { matchId });
    if (!input || input.match.status !== "comparing" || input.match.updatedAt !== startedAt) return null;
    try {
      const { match, bOwnerKey, a, b } = input;
      const [aChats, bChats] = await Promise.all([loadChats(ctx, match.aOwnerKey), loadChats(ctx, bOwnerKey)]);
      const ground = await findCommonGround({
        store: await getMessageStore(),
        llm: openAi(),
        a: { owner: storeOwner(match.aOwnerKey), chats: aChats, profile: a },
        b: { owner: storeOwner(bOwnerKey), chats: bChats, profile: b },
      });
      await ctx.runMutation(internal.matches.saveResult, { matchId, startedAt, result: { ...ground, builtAt: Date.now() } });
    } catch (error) {
      console.error("match " + matchId + " failed", error);
      await ctx.runMutation(internal.matches.fail, { matchId, startedAt, error: errorMessage(error) });
    }
    return null;
  },
});

async function loadChats(ctx: ActionCtx, ownerKey: string): Promise<ChatSource[]> {
  const chats: ChatSource[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { page: ChatSource[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal.interests.chats, {
      ownerKey,
      paginationOpts: { numItems: 500, cursor },
    });
    chats.push(...page.page);
    if (page.isDone) return chats;
    cursor = page.continueCursor;
  }
}

function openAi(): Llm {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Matching needs an OpenAI key on the deployment: npx convex env set OPENAI_API_KEY <key>");
  return openAiLlm({ apiKey, model: process.env.OPENAI_MODEL });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
