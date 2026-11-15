"use node";

import { ConvexError, v } from "convex/values";

import type { Cursor, StoredMessage } from "../pipeline/store";
import type { MessageMeta } from "../pipeline/types";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { getMessageStore, storeOwner } from "./messageStore";
import type { ConversationKind, MessageKind, Platform } from "./validators";

// Full message history lives in the Turso message store. These actions are the app's only way to read it,
// so the store credentials never leave the server.

export interface ChatMessage {
  id: number;
  ts: number;
  sender: string;
  fromMe: boolean;
  kind: MessageKind;
  text: string | null;
  meta: MessageMeta | null;
}

export interface SearchResult extends ChatMessage {
  /** Excerpt with matched words wrapped in ** markers. */
  snippet: string;
  conversation: { id: Id<"conversations">; title: string; platform: Platform; kind: ConversationKind };
}

/** Newest-first page of a conversation. Pass the returned nextCursor to load older messages; null means the start. */
export const page = action({
  args: {
    ownerKey: v.string(),
    conversationId: v.id("conversations"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> => {
    const conversation = await ctx.runQuery(internal.conversations.forOwner, {
      ownerKey: args.ownerKey,
      conversationId: args.conversationId,
    });
    if (!conversation) throw new ConvexError("Conversation not found");
    const limit = clamp(args.limit ?? 50, 1, 200);
    const store = await getMessageStore();
    const rows = await store.page(storeOwner(args.ownerKey), conversation.key, limit, decodeCursor(args.cursor));
    return {
      messages: rows.map((row) => toChatMessage(row, conversation.selfName)),
      nextCursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
    };
  },
});

/** Messages around one message in chronological order, e.g. to open a search result in context. */
export const around = action({
  args: {
    ownerKey: v.string(),
    conversationId: v.id("conversations"),
    messageId: v.number(),
    ts: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ChatMessage[]> => {
    const conversation = await ctx.runQuery(internal.conversations.forOwner, {
      ownerKey: args.ownerKey,
      conversationId: args.conversationId,
    });
    if (!conversation) throw new ConvexError("Conversation not found");
    const store = await getMessageStore();
    const rows = await store.around(storeOwner(args.ownerKey), conversation.key, { ts: args.ts, id: args.messageId }, clamp(args.limit ?? 40, 2, 200));
    return rows.map((row) => toChatMessage(row, conversation.selfName));
  },
});

/** Full-text search across the user's entire history (or one conversation), best matches first. */
export const search = action({
  args: {
    ownerKey: v.string(),
    query: v.string(),
    conversationId: v.optional(v.id("conversations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchResult[]> => {
    if (!(await ctx.runQuery(internal.owners.exists, { ownerKey: args.ownerKey }))) {
      throw new ConvexError("Unknown owner key");
    }
    const only = args.conversationId
      ? await ctx.runQuery(internal.conversations.forOwner, { ownerKey: args.ownerKey, conversationId: args.conversationId })
      : null;
    if (args.conversationId && !only) throw new ConvexError("Conversation not found");
    const store = await getMessageStore();
    const hits = await store.search(storeOwner(args.ownerKey), args.query, clamp(args.limit ?? 30, 1, 100), only?.key);
    const conversations = await ctx.runQuery(internal.conversations.byKeys, {
      ownerKey: args.ownerKey,
      keys: [...new Set(hits.map((hit) => hit.conversation))],
    });
    const byKey = new Map(conversations.map((c) => [c.key, c]));
    return hits.flatMap((hit) => {
      const c = byKey.get(hit.conversation);
      if (!c) return [];
      return [
        {
          ...toChatMessage(hit, c.selfName),
          snippet: hit.snippet,
          conversation: { id: c._id, title: c.title, platform: c.platform, kind: c.kind },
        },
      ];
    });
  },
});

function toChatMessage(row: StoredMessage, selfName: string | null): ChatMessage {
  return {
    id: row.id,
    ts: row.ts,
    sender: row.sender,
    fromMe: selfName !== null && row.sender === selfName,
    kind: row.kind,
    text: row.text,
    meta: row.meta ? (JSON.parse(row.meta) as MessageMeta) : null,
  };
}

function encodeCursor(row: StoredMessage): string {
  return row.ts + ":" + row.id;
}

function decodeCursor(cursor: string | null | undefined): Cursor | null {
  if (!cursor) return null;
  const [ts, id] = cursor.split(":").map(Number);
  if (!Number.isFinite(ts) || !Number.isFinite(id)) throw new ConvexError("Invalid cursor");
  return { ts, id };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}
