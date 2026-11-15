import { normalizeName } from "./text";
import type { ConversationInput, Platform } from "./types";

export interface ResolvableConversation extends ConversationInput {
  platform: Platform;
}

const GENERIC_SELF = new Set(["you", "me"]);

/**
 * Fills in selfName where the export didn't say who the user is, in this order:
 * 1. a participant matching a known name (typed by the user, learned from earlier uploads, or from the export's profile file);
 * 2. a 1:1 chat titled after one participant, so the user is the other one (WhatsApp);
 * 3. names learned by 1-2 in this upload, applied to the remaining chats (e.g. WhatsApp groups);
 * 4. the participant present in nearly every conversation of a platform (Instagram and Messenger inboxes).
 * Returns the real names learned, so later uploads can use them too.
 */
export function resolveSelf(conversations: ResolvableConversation[], hints: string[]): string[] {
  const hinted = new Set(hints.map(normalizeName).filter(Boolean));
  const learned = new Set<string>();
  const unresolved: ResolvableConversation[] = [];

  for (const c of conversations) {
    if (c.selfName) {
      if (c.kind !== "ai" && !GENERIC_SELF.has(normalizeName(c.selfName))) learned.add(c.selfName);
      continue;
    }
    const matches = c.participants.filter((p) => hinted.has(normalizeName(p)));
    if (matches.length === 1) {
      c.selfName = matches[0];
      continue;
    }
    if (c.kind === "dm" && c.participants.length === 2 && c.title) {
      const title = normalizeName(c.title);
      const others = c.participants.filter((p) => normalizeName(p) !== title);
      if (others.length === 1) {
        c.selfName = others[0];
        learned.add(others[0]);
        continue;
      }
    }
    unresolved.push(c);
  }

  const learnedKeys = new Set([...learned].map(normalizeName));
  const stillUnresolved: ResolvableConversation[] = [];
  for (const c of unresolved) {
    const matches = c.participants.filter((p) => learnedKeys.has(normalizeName(p)));
    if (matches.length === 1) c.selfName = matches[0];
    else stillUnresolved.push(c);
  }

  for (const platform of new Set(stillUnresolved.map((c) => c.platform))) {
    const all = conversations.filter((c) => c.platform === platform);
    const presence = new Map<string, number>();
    for (const c of all) for (const p of new Set(c.participants)) presence.set(p, (presence.get(p) ?? 0) + 1);
    const [top, runnerUp] = [...presence].sort((a, b) => b[1] - a[1]);
    if (!top || top[1] < 2 || top[1] < 0.6 * all.length || (runnerUp && runnerUp[1] === top[1])) continue;
    for (const c of stillUnresolved) {
      if (c.platform === platform && c.participants.includes(top[0])) {
        c.selfName = top[0];
        learned.add(top[0]);
      }
    }
  }
  return [...learned];
}

/** Title for exports that don't carry one: the other participants' names. */
export function titleFromParticipants(participants: string[], selfName: string | null | undefined): string {
  const others = participants.filter((p) => p && p !== selfName);
  if (others.length === 0) return participants[0] ?? "Untitled chat";
  if (others.length <= 3) return others.join(", ");
  return others.slice(0, 3).join(", ") + " +" + (others.length - 3);
}
