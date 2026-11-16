import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { advanceMatch, findInterestProfile, matchesOf, requestBuild, sideState, STALLED_MS } from "./lib/matching";
import { requireProfile } from "./lib/owner";
import { commonGroundV } from "./validators";

// Two users compare their histories to find what they have in common. Each person's interests come only from
// messages they sent, and neither ever sees the other's messages or full profile: a match shows only the overlap.

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Starts a match and returns the invite code to send to the other person. Creating one opts the user into matching,
 * so their interest profile starts building right away and is ready by the time the other person joins.
 */
export const create = mutation({
  args: { ownerKey: v.string(), name: v.string() },
  returns: v.object({ matchId: v.id("matches"), code: v.string() }),
  handler: async (ctx, { ownerKey, name }) => {
    await requireProfile(ctx, ownerKey);
    const aName = displayName(name);
    let code = newCode();
    while (await ctx.db.query("matches").withIndex("by_code", (q) => q.eq("code", code)).first()) code = newCode();
    const now = Date.now();
    const matchId = await ctx.db.insert("matches", {
      code,
      aOwnerKey: ownerKey,
      aName,
      bOwnerKey: null,
      bName: null,
      status: "waiting",
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    await requestBuild(ctx, ownerKey);
    return { matchId, code };
  },
});

/** Joins a match with the code the other person shared. The comparison starts once both histories are analyzed. */
export const join = mutation({
  args: { ownerKey: v.string(), code: v.string(), name: v.string() },
  returns: v.id("matches"),
  handler: async (ctx, { ownerKey, code, name }) => {
    await requireProfile(ctx, ownerKey);
    const match = await ctx.db
      .query("matches")
      .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
      .unique();
    if (!match) throw new ConvexError("No invite has that code.");
    if (match.aOwnerKey === ownerKey) throw new ConvexError("That's your own invite. Send the code to the person you want to compare with.");
    if (match.bOwnerKey === ownerKey) return match._id;
    if (match.bOwnerKey) throw new ConvexError("Someone else already used this invite.");
    const joined = { ...match, bOwnerKey: ownerKey, bName: displayName(name), status: "analyzing" as const, updatedAt: Date.now() };
    await ctx.db.patch("matches", match._id, { bOwnerKey: joined.bOwnerKey, bName: joined.bName, status: joined.status, updatedAt: joined.updatedAt });
    await advanceMatch(ctx, joined);
    return match._id;
  },
});

/**
 * One match from the viewer's side: "you" is the viewer, "them" the other person.
 * status: waiting (for the other person to join) → analyzing → comparing → ready, or failed with error.
 * Each person's state: uploading | needs_upload | analyzing | ready | failed.
 * result.items lists what you have in common, the things that never came up between you (hidden) first. Each item
 * has a detail line, a message count, and a first-mention date for each of you, how often it came up in your chats
 * with each other (betweenYou), and a starter line. result.sharedChats counts your chats with each other.
 */
export const get = query({
  args: { ownerKey: v.string(), matchId: v.id("matches") },
  handler: async (ctx, { ownerKey, matchId }) => {
    const match = await ctx.db.get("matches", matchId);
    if (!match || (match.aOwnerKey !== ownerKey && match.bOwnerKey !== ownerKey)) return null;
    const mine = match.aOwnerKey === ownerKey ? "a" : "b";
    const theirs = mine === "a" ? "b" : "a";
    const other = mine === "a" ? match.bOwnerKey : match.aOwnerKey;
    const you = await sideView(ctx, ownerKey);
    return {
      _id: match._id,
      code: match.code,
      status: match.status,
      error: match.error,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      you: { name: mine === "a" ? match.aName : (match.bName ?? ""), state: you.state, messages: you.messages },
      them: other ? { name: (theirs === "a" ? match.aName : match.bName) ?? "", state: (await sideView(ctx, other)).state } : null,
      result: match.result && {
        items: match.result.items.map((item) => ({
          title: item.title,
          category: item.category,
          match: item.match,
          hidden: item.hidden,
          betweenYou: item.betweenYou,
          starter: item.starter,
          you: item[mine],
          them: item[theirs],
        })),
        sharedChats: match.result.sharedChats[mine],
        builtAt: match.result.builtAt,
      },
    };
  },
});

/** The user's matches, most recently updated first. */
export const list = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const matches = await matchesOf(ctx, ownerKey);
    return matches
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((match) => {
        const mine = match.aOwnerKey === ownerKey;
        return {
          _id: match._id,
          code: match.code,
          status: match.status,
          them: mine ? match.bName : match.aName,
          shared: match.result?.items.length ?? null,
          hidden: match.result?.items.filter((item) => item.hidden).length ?? null,
          updatedAt: match.updatedAt,
        };
      });
  },
});

/** Compares again, for example after a failure. A side whose analysis failed is analyzed again first. */
export const rerun = mutation({
  args: { ownerKey: v.string(), matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, { ownerKey, matchId }) => {
    const match = await participantMatch(ctx, ownerKey, matchId);
    if (!match.bOwnerKey) throw new ConvexError("The other person hasn't joined yet.");
    if (match.status === "comparing" && Date.now() - match.updatedAt < STALLED_MS) return null;
    for (const key of [match.aOwnerKey, match.bOwnerKey]) {
      if ((await sideState(ctx, key)).state === "failed") await requestBuild(ctx, key, { force: true });
    }
    const next = { ...match, status: "analyzing" as const, error: null, updatedAt: Date.now() };
    await ctx.db.patch("matches", match._id, { status: next.status, error: null, updatedAt: next.updatedAt });
    await advanceMatch(ctx, next);
    return null;
  },
});

/** Deletes the match and its result for both people. Either of them can. */
export const remove = mutation({
  args: { ownerKey: v.string(), matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, { ownerKey, matchId }) => {
    await participantMatch(ctx, ownerKey, matchId);
    await ctx.db.delete("matches", matchId);
    return null;
  },
});

export const forCompare = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get("matches", matchId);
    if (!match?.bOwnerKey) return null;
    const a = await findInterestProfile(ctx, match.aOwnerKey);
    const b = await findInterestProfile(ctx, match.bOwnerKey);
    if (a?.status !== "ready" || b?.status !== "ready") return null;
    return { match, bOwnerKey: match.bOwnerKey, a, b };
  },
});

export const saveResult = internalMutation({
  args: { matchId: v.id("matches"), startedAt: v.number(), result: commonGroundV },
  returns: v.null(),
  handler: async (ctx, { matchId, startedAt, result }) => {
    const match = await ctx.db.get("matches", matchId);
    // Deleted meanwhile, or a newer run took over.
    if (!match || match.status !== "comparing" || match.updatedAt !== startedAt) return null;
    await ctx.db.patch("matches", matchId, { status: "ready", result, error: null, updatedAt: Date.now() });
    return null;
  },
});

export const fail = internalMutation({
  args: { matchId: v.id("matches"), startedAt: v.number(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { matchId, startedAt, error }) => {
    const match = await ctx.db.get("matches", matchId);
    if (!match || match.status !== "comparing" || match.updatedAt !== startedAt) return null;
    await ctx.db.patch("matches", matchId, { status: "failed", error: error.slice(0, 500), updatedAt: Date.now() });
    return null;
  },
});

/** Fails a comparison whose action died instead of leaving the match spinning. */
export const watchdog = internalMutation({
  args: { matchId: v.id("matches"), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { matchId, startedAt }) => {
    const match = await ctx.db.get("matches", matchId);
    if (!match || match.status !== "comparing" || match.updatedAt !== startedAt) return null;
    await ctx.db.patch("matches", matchId, { status: "failed", error: "Comparing stopped before it finished. Try again.", updatedAt: Date.now() });
    return null;
  },
});

async function participantMatch(ctx: QueryCtx, ownerKey: string, matchId: Id<"matches">): Promise<Doc<"matches">> {
  const match = await ctx.db.get("matches", matchId);
  if (!match || (match.aOwnerKey !== ownerKey && match.bOwnerKey !== ownerKey)) throw new ConvexError("Match not found.");
  return match;
}

/** A side's state as the app shows it, plus how many messages of the viewer's own the analysis found. */
async function sideView(ctx: QueryCtx, ownerKey: string) {
  const { state, profile } = await sideState(ctx, ownerKey);
  return {
    state: state === "building" || state === "stale" ? ("analyzing" as const) : state,
    messages: profile?.status === "ready" ? profile.messages : null,
  };
}

function displayName(name: string): string {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new ConvexError("Add the name the other person knows you by.");
  return trimmed;
}

function newCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}
