import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { advanceMatch, findInterestProfile, historyState, matchesOf, requestBuild, rerunMatchesOf } from "./lib/matching";
import { requireProfile } from "./lib/owner";
import { interestV } from "./validators";

/**
 * The user's own interest profile: what the messages they sent show they're into, strongest first, each with how
 * many of their messages mention it. null until they opt into matching (matches.create, matches.join, or refresh).
 * While a rebuild runs, status is "building" and the previous interests stay readable.
 */
export const mine = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const profile = await findInterestProfile(ctx, ownerKey);
    if (!profile) return null;
    return {
      status: profile.status,
      interests: profile.interests,
      messages: profile.messages,
      read: profile.read,
      builtAt: profile.builtAt,
      error: profile.error,
    };
  },
});

/** Builds the user's interest profile from their current history, or rebuilds it. */
export const refresh = mutation({
  args: { ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerKey }) => {
    await requireProfile(ctx, ownerKey);
    await requestBuild(ctx, ownerKey, { force: true });
    return null;
  },
});

export const history = internalQuery({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => await historyState(ctx, ownerKey),
});

/** The user's chats, trimmed to what the interest builder reads. */
export const chats = internalQuery({
  args: { ownerKey: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { ownerKey, paginationOpts }) => {
    const result = await ctx.db
      .query("conversations")
      .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey))
      .paginate(paginationOpts);
    return { ...result, page: result.page.map((c) => ({ key: c.key, kind: c.kind, selfName: c.selfName, participants: c.participants })) };
  },
});

export const save = internalMutation({
  args: {
    ownerKey: v.string(),
    startedAt: v.number(),
    historyAt: v.number(),
    interests: v.array(interestV),
    messages: v.number(),
    read: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { ownerKey, startedAt, ...fields }) => {
    const profile = await findInterestProfile(ctx, ownerKey);
    // The user deleted their data, or a newer build took over.
    if (!profile || profile.status !== "building" || profile.startedAt !== startedAt) return null;
    await ctx.db.patch("interestProfiles", profile._id, { ...fields, status: "ready", builtAt: Date.now(), error: null });
    await afterBuild(ctx, ownerKey);
    return null;
  },
});

export const fail = internalMutation({
  args: { ownerKey: v.string(), startedAt: v.number(), historyAt: v.number(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerKey, startedAt, historyAt, error }) => {
    const profile = await findInterestProfile(ctx, ownerKey);
    if (!profile || profile.status !== "building" || profile.startedAt !== startedAt) return null;
    await ctx.db.patch("interestProfiles", profile._id, { status: "failed", historyAt, builtAt: Date.now(), error: error.slice(0, 500) });
    await afterBuild(ctx, ownerKey);
    return null;
  },
});

/** Fails a build whose action died (timeout, crash) instead of leaving it, and every match waiting on it, stuck. */
export const watchdog = internalMutation({
  args: { ownerKey: v.string(), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { ownerKey, startedAt }) => {
    const profile = await findInterestProfile(ctx, ownerKey);
    if (!profile || profile.status !== "building" || profile.startedAt !== startedAt) return null;
    const { latestAt } = await historyState(ctx, ownerKey);
    await ctx.db.patch("interestProfiles", profile._id, {
      status: "failed",
      historyAt: latestAt,
      builtAt: Date.now(),
      error: "Analyzing the messages stopped before it finished. Try again.",
    });
    await afterBuild(ctx, ownerKey);
    return null;
  },
});

/**
 * Runs when one of the user's uploads finishes or fails. If they've opted into matching, their profile is rebuilt
 * from the new history, and matches waiting on that upload move on.
 */
export const historyChanged = internalMutation({
  args: { ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerKey }) => {
    const matches = await matchesOf(ctx, ownerKey);
    if (matches.length === 0 && !(await findInterestProfile(ctx, ownerKey))) return null;
    await requestBuild(ctx, ownerKey);
    for (const match of matches) await advanceMatch(ctx, match);
    return null;
  },
});

async function afterBuild(ctx: MutationCtx, ownerKey: string) {
  // An upload that finished while this build ran has already made it stale.
  await requestBuild(ctx, ownerKey);
  await rerunMatchesOf(ctx, ownerKey);
}
