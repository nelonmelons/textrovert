import { v, type Infer } from "convex/values";

import { INTEREST_CATEGORIES } from "../pipeline/interests";

export const platformV = v.union(
  v.literal("whatsapp"),
  v.literal("imessage"),
  v.literal("instagram"),
  v.literal("messenger"),
  v.literal("telegram"),
  v.literal("discord"),
  v.literal("snapchat"),
  v.literal("chatgpt"),
  v.literal("claude"),
  v.literal("csv"),
  v.literal("signal"),
  v.literal("slack"),
  v.literal("sms"),
  v.literal("other"),
);
export type Platform = Infer<typeof platformV>;

export const conversationKindV = v.union(v.literal("dm"), v.literal("group"), v.literal("ai"));
export type ConversationKind = Infer<typeof conversationKindV>;

export const messageKindV = v.union(
  v.literal("text"),
  v.literal("media"),
  v.literal("call"),
  v.literal("system"),
  v.literal("deleted"),
);
export type MessageKind = Infer<typeof messageKindV>;

export const uploadStatusV = v.union(
  v.literal("queued"),
  v.literal("parsing"),
  v.literal("analyzing"),
  v.literal("done"),
  v.literal("failed"),
);
export type UploadStatus = Infer<typeof uploadStatusV>;

const nullableNumber = v.union(v.number(), v.null());

export const textCountV = v.object({ text: v.string(), count: v.number() });
export type TextCount = Infer<typeof textCountV>;

export const participantStatsV = v.object({
  name: v.string(),
  isMe: v.boolean(),
  messages: v.number(),
  words: v.number(),
  media: v.number(),
  emojis: v.number(),
  laughs: v.number(),
  questions: v.number(),
  initiations: v.number(),
  doubleTexts: v.number(),
  lastWords: v.number(),
  replies: v.number(),
  replyMedianSec: nullableNumber,
});
export type ParticipantStats = Infer<typeof participantStatsV>;

export const conversationStatsV = v.object({
  messages: v.number(),
  myMessages: v.number(),
  firstAt: nullableNumber,
  lastAt: nullableNumber,
  activeDays: v.number(),
  longestStreakDays: v.number(),
  longestGapDays: v.number(),
  sessions: v.number(),
  participantCount: v.number(),
  participants: v.array(participantStatsV),
  hourly: v.array(v.number()),
  weekday: v.array(v.number()),
  myHeatmap: v.array(v.number()),
  monthly: v.array(v.object({ month: v.string(), mine: v.number(), theirs: v.number() })),
  myReplyHistogram: v.array(v.number()),
  theirReplyHistogram: v.array(v.number()),
  topWords: v.array(textCountV),
  topEmojis: v.array(textCountV),
  myTopWords: v.array(textCountV),
  myTopEmojis: v.array(textCountV),
  links: v.number(),
  calls: v.number(),
  ai: v.union(
    v.null(),
    v.object({
      prompts: v.number(),
      responses: v.number(),
      avgPromptWords: v.number(),
      models: v.array(textCountV),
    }),
  ),
});
export type ConversationStats = Infer<typeof conversationStatsV>;

export const personV = v.object({
  key: v.string(),
  name: v.string(),
  aliases: v.array(v.string()),
  platforms: v.array(platformV),
  conversationKeys: v.array(v.string()),
  messages: v.number(),
  fromThem: v.number(),
  fromMe: v.number(),
  dmMessages: v.number(),
  firstAt: nullableNumber,
  lastAt: nullableNumber,
  theirReplyMedianSec: nullableNumber,
  myReplyMedianSec: nullableNumber,
  initiatedByMe: v.number(),
  initiatedByThem: v.number(),
  closeness: v.number(),
});
export type Person = Infer<typeof personV>;

export const insightsV = v.object({
  generatedAt: v.number(),
  totals: v.object({
    messages: v.number(),
    sent: v.number(),
    received: v.number(),
    conversations: v.number(),
    dms: v.number(),
    groups: v.number(),
    aiChats: v.number(),
    people: v.number(),
    firstAt: nullableNumber,
    lastAt: nullableNumber,
  }),
  platforms: v.array(
    v.object({ platform: platformV, conversations: v.number(), messages: v.number(), sent: v.number() }),
  ),
  heatmap: v.array(v.number()),
  monthly: v.array(v.object({ month: v.string(), sent: v.number(), received: v.number() })),
  reply: v.object({
    myMedianSec: nullableNumber,
    theirMedianSec: nullableNumber,
    myHistogram: v.array(v.number()),
    theirHistogram: v.array(v.number()),
  }),
  habits: v.object({
    initiationRate: nullableNumber,
    doubleTextRate: nullableNumber,
    nightOwlRate: nullableNumber,
    avgWordsPerMessage: nullableNumber,
    laughRate: nullableNumber,
    questionRate: nullableNumber,
    emojiRate: nullableNumber,
  }),
  topEmojis: v.array(textCountV),
  topWords: v.array(textCountV),
  topPeople: v.array(
    v.object({
      key: v.string(),
      name: v.string(),
      closeness: v.number(),
      messages: v.number(),
      platforms: v.array(platformV),
    }),
  ),
  archetypes: v.array(v.object({ id: v.string(), label: v.string(), reason: v.string() })),
  ai: v.union(
    v.null(),
    v.object({
      prompts: v.number(),
      conversations: v.number(),
      avgPromptWords: v.number(),
      monthly: v.array(v.object({ month: v.string(), prompts: v.number() })),
    }),
  ),
});
export type Insights = Infer<typeof insightsV>;

export const interestCategoryV = v.union(...INTEREST_CATEGORIES.map((category) => v.literal(category)));

/** One interest in a user's profile, found in messages they sent (see pipeline/interests.ts). */
export const interestV = v.object({
  id: v.string(),
  name: v.string(),
  category: interestCategoryV,
  summary: v.string(),
  specifics: v.array(v.string()),
  keywords: v.array(v.string()),
  mentions: v.number(),
  firstAt: nullableNumber,
  lastAt: nullableNumber,
});

export const sharedSideV = v.object({ detail: v.string(), mentions: v.number(), since: nullableNumber });

/** Something two matched users have in common (see pipeline/commonGround.ts). */
export const sharedInterestV = v.object({
  title: v.string(),
  category: interestCategoryV,
  match: v.union(v.literal("same"), v.literal("activity"), v.literal("related")),
  hidden: v.boolean(),
  betweenYou: v.number(),
  starter: v.string(),
  a: sharedSideV,
  b: sharedSideV,
});

export const commonGroundV = v.object({
  items: v.array(sharedInterestV),
  sharedChats: v.object({ a: v.number(), b: v.number() }),
  builtAt: v.number(),
});

export const matchStatusV = v.union(
  v.literal("waiting"),
  v.literal("analyzing"),
  v.literal("comparing"),
  v.literal("ready"),
  v.literal("failed"),
);
export type MatchStatus = Infer<typeof matchStatusV>;
