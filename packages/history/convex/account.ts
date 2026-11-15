"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { getMessageStore, storeOwner } from "./messageStore";

/** Erases everything stored for this owner: full message history in Turso, then every Convex row and file. */
export const deleteAllData = action({
  args: { ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerKey }) => {
    if (!(await ctx.runQuery(internal.owners.exists, { ownerKey }))) throw new ConvexError("Unknown owner key");
    const store = await getMessageStore();
    await store.deleteOwner(storeOwner(ownerKey));
    while (await ctx.runMutation(internal.owners.deleteBatch, { ownerKey })) {
      // keep deleting until nothing is left
    }
    return null;
  },
});
