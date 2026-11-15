import type { ConversationInput } from "./types";

/** Repeated declarations of a conversation merge: participants union, later title/kind/selfName win. */
export function mergeConversation(existing: ConversationInput | undefined, next: ConversationInput): ConversationInput {
  if (!existing) return { ...next, participants: [...new Set(next.participants)], selfName: next.selfName ?? null };
  return {
    externalId: existing.externalId,
    title: next.title || existing.title,
    kind: next.kind,
    participants: [...new Set([...existing.participants, ...next.participants])],
    selfName: next.selfName ?? existing.selfName ?? null,
  };
}
