import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Longer than an action may run (10 minutes): a build or comparison still unfinished after this has died. */
export const STALLED_MS = 12 * 60_000;

/**
 * Where one side of a match stands. "stale" means the interest profile is missing or older than the user's newest
 * finished upload; "uploading" waits for an upload still being processed, whose completion moves things along.
 */
export type SideState = "uploading" | "needs_upload" | "building" | "stale" | "ready" | "failed";

export async function findInterestProfile(ctx: QueryCtx, ownerKey: string): Promise<Doc<"interestProfiles"> | null> {
  return await ctx.db
    .query("interestProfiles")
    .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
    .unique();
}

/** Whether an upload is still being processed, and when the newest finished upload completed (0 when none has). */
export async function historyState(ctx: QueryCtx, ownerKey: string): Promise<{ processing: boolean; latestAt: number }> {
  const uploads = await ctx.db
    .query("uploads")
    .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
    .take(500);
  let processing = false;
  let latestAt = 0;
  for (const upload of uploads) {
    if (upload.status === "done") latestAt = Math.max(latestAt, upload.finishedAt ?? 0);
    else if (upload.status !== "failed") processing = true;
  }
  return { processing, latestAt };
}

export async function sideState(ctx: QueryCtx, ownerKey: string): Promise<{ state: SideState; profile: Doc<"interestProfiles"> | null }> {
  const history = await historyState(ctx, ownerKey);
  const profile = await findInterestProfile(ctx, ownerKey);
  if (history.processing) return { state: "uploading", profile };
  if (history.latestAt === 0) return { state: "needs_upload", profile };
  if (profile?.status === "building") return { state: "building", profile };
  if (profile && profile.historyAt >= history.latestAt) return { state: profile.status, profile };
  return { state: "stale", profile };
}

/**
 * Starts building the user's interest profile unless an upload is still processing (its completion asks again),
 * there's nothing uploaded yet, a build is running, or the profile already covers the newest upload. With force it
 * rebuilds a current profile too, for example to retry one that failed.
 */
export async function requestBuild(ctx: MutationCtx, ownerKey: string, options: { force?: boolean } = {}): Promise<void> {
  const history = await historyState(ctx, ownerKey);
  if (history.processing || history.latestAt === 0) return;
  const existing = await findInterestProfile(ctx, ownerKey);
  if (existing?.status === "building") return;
  if (existing && !options.force && existing.historyAt >= history.latestAt) return;
  const startedAt = Date.now();
  if (existing) await ctx.db.patch("interestProfiles", existing._id, { status: "building", startedAt, error: null });
  else {
    await ctx.db.insert("interestProfiles", {
      ownerKey,
      status: "building",
      interests: [],
      messages: 0,
      read: 0,
      historyAt: 0,
      startedAt,
      builtAt: null,
      error: null,
    });
  }
  await ctx.scheduler.runAfter(0, internal.commonGround.buildProfile, { ownerKey, startedAt });
  await ctx.scheduler.runAfter(STALLED_MS, internal.interests.watchdog, { ownerKey, startedAt });
}

export async function matchesOf(ctx: QueryCtx, ownerKey: string): Promise<Doc<"matches">[]> {
  const created = await ctx.db
    .query("matches")
    .withIndex("by_aOwnerKey", (q) => q.eq("aOwnerKey", ownerKey))
    .take(200);
  const joined = await ctx.db
    .query("matches")
    .withIndex("by_bOwnerKey", (q) => q.eq("bOwnerKey", ownerKey))
    .take(200);
  return [...created, ...joined];
}

/**
 * Moves an analyzing match forward: starts any interest profile it still needs, fails it when one couldn't be built,
 * and starts the comparison once both profiles cover their owner's newest upload.
 */
export async function advanceMatch(ctx: MutationCtx, match: Doc<"matches">): Promise<void> {
  if (match.status !== "analyzing" || !match.bOwnerKey) return;
  let ready = 0;
  for (const [ownerKey, name] of [
    [match.aOwnerKey, match.aName],
    [match.bOwnerKey, match.bName ?? "the other person"],
  ] as const) {
    const { state, profile } = await sideState(ctx, ownerKey);
    if (state === "ready") ready++;
    else if (state === "stale") await requestBuild(ctx, ownerKey);
    else if (state === "failed") {
      await ctx.db.patch("matches", match._id, {
        status: "failed",
        error: "Couldn't analyze " + name + "'s messages: " + (profile?.error ?? "unknown error"),
        updatedAt: Date.now(),
      });
      return;
    }
  }
  if (ready < 2) return;
  const startedAt = Date.now();
  await ctx.db.patch("matches", match._id, { status: "comparing", error: null, updatedAt: startedAt });
  await ctx.scheduler.runAfter(0, internal.commonGround.compare, { matchId: match._id, startedAt });
  await ctx.scheduler.runAfter(STALLED_MS, internal.matches.watchdog, { matchId: match._id, startedAt });
}

/** After the user's interest profile changes: re-runs every joined match they're in, so results stay current. */
export async function rerunMatchesOf(ctx: MutationCtx, ownerKey: string): Promise<void> {
  for (const match of await matchesOf(ctx, ownerKey)) {
    if (!match.bOwnerKey || match.status === "comparing") continue;
    const next = { ...match, status: "analyzing" as const, updatedAt: Date.now() };
    await ctx.db.patch("matches", match._id, { status: next.status, updatedAt: next.updatedAt });
    await advanceMatch(ctx, next);
  }
}
