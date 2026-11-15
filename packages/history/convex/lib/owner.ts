import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Owner keys are 64 hex chars minted by owners.create. Until the app has real auth, the key is the credential. */
export const OWNER_KEY_RE = /^[a-f0-9]{64}$/;

export async function findProfile(ctx: QueryCtx, ownerKey: string): Promise<Doc<"profiles"> | null> {
  if (!OWNER_KEY_RE.test(ownerKey)) return null;
  return await ctx.db
    .query("profiles")
    .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
    .unique();
}

export async function requireProfile(ctx: QueryCtx, ownerKey: string): Promise<Doc<"profiles">> {
  const profile = await findProfile(ctx, ownerKey);
  if (!profile) throw new ConvexError("Unknown owner key");
  return profile;
}
