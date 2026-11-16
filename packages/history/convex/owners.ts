import { v } from "convex/values";

import { DEFAULT_TIME_ZONE } from "../pipeline/time";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { findProfile } from "./lib/owner";
import { onboardingV } from "./schema";

/** Mints an owner key for a new device. The app stores it in SecureStore; it is the key to all of the user's data. */
export const create = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const ownerKey = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    await ctx.runMutation(internal.owners.insertProfile, { ownerKey });
    return ownerKey;
  },
});

export const insertProfile = internalMutation({
  args: { ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerKey }) => {
    await ctx.db.insert("profiles", { ownerKey, timeZone: DEFAULT_TIME_ZONE, selfNames: [], insights: null, updatedAt: Date.now() });
    return null;
  },
});

export const exists = internalQuery({
  args: { ownerKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { ownerKey }) => (await findProfile(ctx, ownerKey)) !== null,
});

/** Deletes one batch of the owner's Convex data. Returns true while there is more to delete. */
export const deleteBatch = internalMutation({
  args: { ownerKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { ownerKey }) => {
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey))
      .take(200);
    for (const p of people) await ctx.db.delete("people", p._id);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerKey_and_key", (q) => q.eq("ownerKey", ownerKey))
      .take(100);
    for (const c of conversations) await ctx.db.delete("conversations", c._id);
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
      .take(50);
    for (const u of uploads) {
      if (u.storageId) await ctx.storage.delete(u.storageId);
      await ctx.db.delete("uploads", u._id);
    }
    const interestProfiles = await ctx.db
      .query("interestProfiles")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
      .take(10);
    for (const p of interestProfiles) await ctx.db.delete("interestProfiles", p._id);
    // A match holds both people's overlap, so leaving deletes it for the other person too.
    const matches = [
      ...(await ctx.db.query("matches").withIndex("by_aOwnerKey", (q) => q.eq("aOwnerKey", ownerKey)).take(100)),
      ...(await ctx.db.query("matches").withIndex("by_bOwnerKey", (q) => q.eq("bOwnerKey", ownerKey)).take(100)),
    ];
    for (const m of matches) await ctx.db.delete("matches", m._id);
    if (people.length + conversations.length + uploads.length + interestProfiles.length + matches.length > 0) return true;
    const profile = await findProfile(ctx, ownerKey);
    if (profile) await ctx.db.delete("profiles", profile._id);
    return false;
  },
});

/** Stores the onboarding answers on the owner's profile (POST /onboarding). The name also joins selfNames. */
export const saveOnboarding = internalMutation({
  args: { ownerKey: v.string(), onboarding: onboardingV },
  returns: v.boolean(),
  handler: async (ctx, { ownerKey, onboarding }) => {
    const profile = await findProfile(ctx, ownerKey);
    if (!profile) return false;
    const name = onboarding.selfName;
    await ctx.db.patch("profiles", profile._id, {
      onboarding,
      selfNames: name && !profile.selfNames.includes(name) ? [...profile.selfNames, name].slice(-20) : profile.selfNames,
      updatedAt: Date.now(),
    });
    return true;
  },
});

/** The owner's saved onboarding answers, or null (GET /onboarding). */
export const getOnboarding = internalQuery({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => (await findProfile(ctx, ownerKey))?.onboarding ?? null,
});
