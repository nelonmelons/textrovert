import type { Conversation } from "./types.ts";

export interface ChatSummary {
  index: number;
  source: Conversation["source"];
  sourceId: string | null;
  title: string;
  isGroup: boolean;
  participants: string[];
  messageCount: number;
  fromMe: number;
  fromThem: number;
  recentCount: number;
  firstTs: string | null;
  lastTs: string | null;
  lastMessage: string | null;
  score: number;
}

const DAY_MS = 86_400_000;

export function rankConversations(conversations: Conversation[], opts: { now?: Date; recentDays?: number } = {}): ChatSummary[] {
  const now = (opts.now ?? new Date()).getTime();
  const recentCutoff = now - (opts.recentDays ?? 30) * DAY_MS;
  return conversations
    .map((c, index): ChatSummary => {
      const real = c.messages.filter((m) => m.kind !== "system");
      const fromMe = real.filter((m) => m.isSelf).length;
      const fromThem = real.length - fromMe;
      const times = real.map((m) => (m.ts ? Date.parse(m.ts) : NaN)).filter((t) => !Number.isNaN(t));
      const recentCount = times.filter((t) => t >= recentCutoff).length;
      const last = real[real.length - 1];
      const lastTime = times.length ? Math.max(...times) : 0;
      const balance = real.length ? Math.min(fromMe, fromThem) / Math.max(1, Math.max(fromMe, fromThem)) : 0;
      const daysSince = lastTime ? (now - lastTime) / DAY_MS : 365;
      const score = Math.round((recentCount * 2 + Math.log2(1 + real.length) * 10) * (0.5 + balance) * (c.isGroup ? 0.6 : 1) / (1 + daysSince / 14));
      return {
        index,
        source: c.source,
        sourceId: c.sourceId ?? null,
        title: c.title ?? (c.participants.filter((p) => !p.isSelf).map((p) => p.name).join(", ") || "untitled"),
        isGroup: c.isGroup,
        participants: c.participants.filter((p) => !p.isSelf && p.id !== "system").map((p) => p.name),
        messageCount: real.length,
        fromMe,
        fromThem,
        recentCount,
        firstTs: real[0]?.ts ?? null,
        lastTs: last?.ts ?? null,
        lastMessage: last ? last.text.slice(0, 80) : null,
        score,
      };
    })
    .filter((s) => s.messageCount > 0)
    .sort((a, b) => b.score - a.score);
}
