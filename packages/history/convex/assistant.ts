"use node";

import { ConvexError, v } from "convex/values";

import { ask as askAgent, openAiComplete, type AssistantAnswer } from "../pipeline/assistant/agent";
import { answerRequest, ApiError, friendRoute, RawJson, type ApiAnswer } from "../pipeline/assistant/api";
import { parseWrappedRequest, wrappedRequest, type WrappedApiResponse } from "../pipeline/assistant/wrappedApi";
import { openAIModelSource } from "@textrovert/wrapped/openai";
import { describeEpisode, openAiFacets, segmentEpisodes, type Episode } from "../pipeline/assistant/episodes";
import { extractFacts, openAiFactExtractor, openAiFactResolver, type Fact } from "../pipeline/assistant/facts";
import { chunkMessages, openAiEmbedder } from "../pipeline/assistant/memory";
import { openAiStoryWriter } from "../pipeline/portrait/build";
import { safeTimeZone } from "../pipeline/time";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { getEpisodeIndex, getFactIndex, getMemoryIndex, getMessageStore, getPortraitCache, storeOwner } from "./messageStore";

const INDEX_BUDGET_MS = 7 * 60_000;
const FACET_CONCURRENCY = 48;
const FACT_CONCURRENCY = 32;
// Ask is ready once this many of the highest-priority chats have embeddings.
const PRIORITY_CHATS = 15;
const RECENT_MS = 90 * 24 * 60 * 60_000;

/** Chats active in the last ~90 days first, busiest first; then the rest, busiest first. */
function prioritize<T extends { lastAt: number; messageCount: number }>(conversations: T[], now: number): T[] {
  const recent = (c: T) => (c.lastAt >= now - RECENT_MS ? 1 : 0);
  return [...conversations].sort((a, b) => recent(b) - recent(a) || b.messageCount - a.messageCount || b.lastAt - a.lastAt);
}

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
    const [conversations, store, memory, episodes, facts] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey: args.ownerKey }),
      getMessageStore(),
      getMemoryIndex(),
      getEpisodeIndex(),
      getFactIndex(),
    ]);
    return await askAgent({
      question,
      history: args.history?.map((t) => ({ role: t.role, content: t.content.slice(0, 4000) })),
      conversations,
      owner: storeOwner(args.ownerKey),
      store,
      memory,
      episodes,
      facts,
      embed: openAiEmbedder(apiKey),
      complete: openAiComplete(apiKey, process.env.ASSISTANT_MODEL || undefined),
      timeZone: safeTimeZone(profile.timeZone),
      now: Date.now(),
    });
  },
});

/**
 * The hosted Ask API's POST /ask (convex/http.ts): the same assistant and citation mapping as scripts/ask-server.ts,
 * over one owner's chats. Returns the HTTP status with the body so the route can answer 404s without a 500.
 */
export const answerApi = internalAction({
  args: {
    ownerKey: v.string(),
    question: v.string(),
    person: v.optional(v.string()),
    history: v.optional(v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), content: v.string() }))),
  },
  handler: async (ctx, { ownerKey, ...request }): Promise<{ status: number; body: ApiAnswer | { error: string } }> => {
    const profile = await ctx.runQuery(internal.ingestData.profile, { ownerKey });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!profile || !apiKey) return { status: 503, body: { error: "The Ask API isn't configured" } };
    const [conversations, store, memory, episodes, facts] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey }),
      getMessageStore(),
      getMemoryIndex(),
      getEpisodeIndex(),
      getFactIndex(),
    ]);
    try {
      const body = await answerRequest(request, {
        conversations,
        owner: storeOwner(ownerKey),
        store,
        memory,
        episodes,
        facts,
        embed: openAiEmbedder(apiKey),
        complete: openAiComplete(apiKey, process.env.ASSISTANT_MODEL || undefined),
        timeZone: safeTimeZone(profile.timeZone),
        now: Date.now(),
      });
      return { status: 200, body };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: error.message } };
      throw error;
    }
  },
});

/** POST /wrapped for the hosted API: one Wrapped edition for one of the owner's DMs, with the server-side model. */
export const wrappedApi = internalAction({
  args: { ownerKey: v.string(), request: v.any() },
  handler: async (ctx, { ownerKey, request }): Promise<{ status: number; body: WrappedApiResponse | { error: string } }> => {
    const profile = await ctx.runQuery(internal.ingestData.profile, { ownerKey });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!profile || !apiKey) return { status: 503, body: { error: "The Ask API isn't configured" } };
    const [conversations, store] = await Promise.all([ctx.runQuery(internal.conversations.directory, { ownerKey }), getMessageStore()]);
    const owner = storeOwner(ownerKey);
    try {
      const body = await wrappedRequest(parseWrappedRequest(request), {
        conversations,
        loadRows: async (ref) => {
          const rows = [];
          for await (const page of store.scan(owner, [ref.key])) rows.push(...page.messages);
          return rows;
        },
        timeZone: safeTimeZone(profile.timeZone),
        modelSource: openAIModelSource({ apiKey, model: process.env.WRAPPED_MODEL || undefined }),
      });
      return { status: 200, body };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: error.message } };
      throw error;
    }
  },
});

/**
 * The hosted GET /friend, GET /story, GET /portrait and GET|POST /reel (convex/http.ts): the same friendRoute as
 * scripts/ask-server.ts over one owner's chats. Reels have no renderer here, so they answer "unavailable". The body
 * comes back serialized, since the portrait can be several megabytes.
 */
export const friendApi = internalAction({
  args: { ownerKey: v.string(), method: v.string(), path: v.string(), query: v.string(), body: v.optional(v.string()) },
  handler: async (ctx, { ownerKey, method, path, query, body }): Promise<{ status: number; text: string }> => {
    const profile = await ctx.runQuery(internal.ingestData.profile, { ownerKey });
    if (!profile) return { status: 503, text: JSON.stringify({ error: "The Ask API isn't configured" }) };
    const apiKey = process.env.OPENAI_API_KEY;
    const [conversations, store, episodes, facts, cache] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey }),
      getMessageStore(),
      getEpisodeIndex(),
      getFactIndex(),
      getPortraitCache(),
    ]);
    try {
      const parsed = body ? (JSON.parse(body) as unknown) : null;
      const context = { conversations, owner: storeOwner(ownerKey), store, episodes, facts, cache, timeZone: safeTimeZone(profile.timeZone), writeStory: apiKey ? openAiStoryWriter(apiKey) : null };
      const result = await friendRoute(method, path, new URLSearchParams(query), parsed, context, null);
      if (result === null) return { status: 404, text: JSON.stringify({ error: "Not found" }) };
      return { status: 200, text: result instanceof RawJson ? result.text : JSON.stringify(result) };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, text: JSON.stringify({ error: error.message }) };
      if (error instanceof SyntaxError) return { status: 400, text: JSON.stringify({ error: "Body must be a JSON object" }) };
      throw error;
    }
  },
});

/**
 * Indexes every message stored since the last run in three passes over the chats, recent and busy chats first, so a
 * new user's Ask works within minutes while the slow passes backfill: (1) chunk embeddings for meaning search,
 * (2) episodes (summaries with facets and grounded plans) for the topic, grouping and plan tools, (3) facts about
 * people with validity windows, each pinned to the exact characters of its source message. Progress per pass is
 * saved to the indexing table for GET /status. Scheduled after each upload's analysis (a fresh run); reschedules
 * itself with resume when it runs long, continuing from the saved positions. Every pass is idempotent per chat
 * (watermarks in the stores), so a re-run only does new work.
 */
export const index = internalAction({
  args: { ownerKey: v.string(), resume: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { ownerKey, resume }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const deadline = Date.now() + INDEX_BUDGET_MS;
    const owner = storeOwner(ownerKey);
    const [conversations, store, memory, episodeIndex, factIndex, profile] = await Promise.all([
      ctx.runQuery(internal.conversations.directory, { ownerKey }),
      getMessageStore(),
      getMemoryIndex(),
      getEpisodeIndex(),
      getFactIndex(),
      ctx.runQuery(internal.ingestData.profile, { ownerKey }),
    ]);
    const [indexed, episodesUpTo, factsUpTo] = await Promise.all([memory.indexedUpTo(owner), episodeIndex.indexedUpTo(owner), factIndex.progress(owner)]);
    const extractFactsWith = openAiFactExtractor(apiKey);
    const resolve = openAiFactResolver(apiKey);
    const embed = openAiEmbedder(apiKey);
    const extract = openAiFacets(apiKey);
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimeZone(profile?.timeZone ?? "UTC"),
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const ordered = prioritize(conversations, Date.now());
    const saved = resume ? await ctx.runQuery(internal.indexing.get, { ownerKey }) : null;
    const progress = {
      total: ordered.length,
      priority: Math.min(PRIORITY_CHATS, ordered.length),
      chunks: Math.min(saved?.chunks ?? 0, ordered.length),
      episodes: Math.min(saved?.episodes ?? 0, ordered.length),
      facts: Math.min(saved?.facts ?? 0, ordered.length),
      startedAt: saved?.startedAt ?? Date.now(),
      finishedAt: null as number | null,
    };
    const save = () => ctx.runMutation(internal.indexing.save, { ownerKey, progress });
    const pause = async () => {
      await save();
      await ctx.scheduler.runAfter(0, internal.assistant.index, { ownerKey, resume: true });
      return null;
    };
    await save();
    const labelFor = (c: (typeof ordered)[number]) => (sender: string) => (c.selfName && sender === c.selfName ? "Me" : sender);

    // Pass 1: chunk embeddings. Once the priority chats are done, Ask is ready.
    for (; progress.chunks < ordered.length; progress.chunks++) {
      if (Date.now() > deadline) return await pause();
      const c = ordered[progress.chunks];
      const fresh = await store.storedAfter(owner, c.key, indexed.get(c.key) ?? 0);
      const chunks = chunkMessages(c.key, fresh, labelFor(c));
      for (let i = 0; i < chunks.length; i += 500) await memory.add(owner, chunks.slice(i, i + 500), embed);
      if (progress.chunks < progress.priority || progress.chunks % 10 === 0) await save();
    }
    await save();

    // Pass 2: episodes, priority chats first. Each batch advances the store's watermark, so a pause mid-chat resumes there.
    for (; progress.episodes < ordered.length; progress.episodes++) {
      if (Date.now() > deadline) return await pause();
      const c = ordered[progress.episodes];
      const label = labelFor(c);
      const unsummarized = await store.storedAfter(owner, c.key, episodesUpTo.get(c.key) ?? 0);
      const segments = segmentEpisodes(unsummarized);
      for (let i = 0; i < segments.length; i += FACET_CONCURRENCY * 2) {
        if (Date.now() > deadline) return await pause();
        const batch = segments.slice(i, i + FACET_CONCURRENCY * 2);
        const described: (Episode | null)[] = [];
        for (let j = 0; j < batch.length; j += FACET_CONCURRENCY) {
          described.push(...(await Promise.all(batch.slice(j, j + FACET_CONCURRENCY).map((s) => describeEpisode(c.key, s, label, (ts) => stamp.format(ts), extract)))));
        }
        await episodeIndex.add(owner, described.filter((e): e is Episode => e !== null), embed);
      }
      await save();
    }

    // Pass 3: facts.
    for (; progress.facts < ordered.length; progress.facts++) {
      if (Date.now() > deadline) return await pause();
      const c = ordered[progress.facts];
      const label = labelFor(c);
      const factSegments = segmentEpisodes(await store.storedAfter(owner, c.key, factsUpTo.get(c.key) ?? 0));
      for (let i = 0; i < factSegments.length; i += FACT_CONCURRENCY) {
        if (Date.now() > deadline) return await pause();
        const batch = factSegments.slice(i, i + FACT_CONCURRENCY);
        const found: Fact[] = (await Promise.all(batch.map((s) => extractFacts(c.key, s, label, (ts) => stamp.format(ts), extractFactsWith)))).flat();
        await factIndex.add(owner, found, embed, resolve);
        await factIndex.markProgress(owner, c.key, Math.max(...batch.flat().map((m) => m.id)));
      }
      await save();
    }
    progress.finishedAt = Date.now();
    await save();
    return null;
  },
});
