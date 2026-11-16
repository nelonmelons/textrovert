/** Topic tags that describe the medium rather than the friendship. */
export const GENERIC_TOPICS = new Set([
  "media", "media sharing", "social media", "instagram", "logistics", "plans", "planning", "meetup", "meetups", "memes", "meme", "reels", "reel",
  "banter", "small talk", "jokes", "joke", "humor", "chat", "group chat", "greetings", "links", "link sharing", "photos", "photo", "video", "videos",
  "messages", "messaging", "attachments", "attachment", "reaction", "reactions", "schedule", "timing", "texting", "scheduling", "coordination", "hangout", "hangouts", "friends", "friendship", "conversation", "inside joke",
]);
export const meaningfulTopics = <T extends [string, number]>(topics: T[]) => topics.filter(([t]) => !GENERIC_TOPICS.has(t.toLowerCase()));
