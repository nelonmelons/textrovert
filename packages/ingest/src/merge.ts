import type { Conversation, Message } from "./types.ts";

const keyOf = (m: Message) => `${m.ts ?? ""}|${m.senderId}|${m.text}`;

export function mergeConversations(existing: Conversation, incoming: Conversation): Conversation {
  const byKey = new Map<string, { m: Message; replyKey?: string }>();
  for (const conv of [existing, incoming]) {
    for (const m of conv.messages) {
      const replyKey = m.replyTo !== undefined ? keyOf(conv.messages[m.replyTo]) : undefined;
      byKey.set(keyOf(m), { m, replyKey });
    }
  }
  const sorted = [...byKey.values()].sort((a, b) => (a.m.ts ?? "").localeCompare(b.m.ts ?? ""));
  const index = new Map(sorted.map((e, i) => [keyOf(e.m), i]));
  const messages = sorted.map(({ m, replyKey }, i) => {
    const out: Message = { ...m, i };
    delete out.replyTo;
    const target = replyKey !== undefined ? index.get(replyKey) : undefined;
    if (target !== undefined) out.replyTo = target;
    return out;
  });
  const participants = new Map(existing.participants.map((p) => [p.id, p]));
  for (const p of incoming.participants) participants.set(p.id, p);
  return {
    ...existing,
    title: incoming.title ?? existing.title,
    isGroup: existing.isGroup || incoming.isGroup,
    participants: [...participants.values()],
    messages,
    warnings: incoming.warnings,
  };
}
