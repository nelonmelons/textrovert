import type { Conversation, Message } from "./types.ts";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const INITIATION_GAP_MS = 6 * 3600_000;

function parse(ts: string | null): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : t;
}

export function formatGap(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "+<1m";
  if (m < 60) return `+${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `+${h}h${m % 60 ? String(m % 60).padStart(2, "0") + "m" : ""}`;
  return `+${Math.round(h / 24)}d`;
}

function formatTs(m: Message): string {
  if (!m.ts) return "time unknown";
  const d = new Date(m.ts);
  const label = `${m.ts.slice(0, 10)} ${DAY[d.getDay()]} ${m.ts.slice(11, 16)}`;
  return m.tsConfidence === "inferred" ? `~${label}` : label;
}

export interface ParticipantStats {
  name: string;
  isSelf: boolean;
  messages: number;
  words: number;
  initiations: number;
  medianReplyMinutes: number | null;
}

export function computeStats(conv: Conversation): ParticipantStats[] {
  const replyTimes = new Map<string, number[]>();
  const stats = new Map<string, ParticipantStats>(
    conv.participants.map((p) => [p.id, { name: p.name, isSelf: p.isSelf, messages: 0, words: 0, initiations: 0, medianReplyMinutes: null }]),
  );
  let prev: Message | null = null;
  for (const m of conv.messages) {
    const s = stats.get(m.senderId);
    if (!s) continue;
    s.messages++;
    s.words += m.text.split(/\s+/).filter(Boolean).length;
    const t = parse(m.ts);
    const pt = prev ? parse(prev.ts) : null;
    if (!prev || (t !== null && pt !== null && t - pt >= INITIATION_GAP_MS)) s.initiations++;
    if (prev && prev.senderId !== m.senderId && t !== null && pt !== null && m.tsConfidence !== "inferred") {
      const list = replyTimes.get(m.senderId) ?? [];
      list.push((t - pt) / 60_000);
      replyTimes.set(m.senderId, list);
    }
    prev = m;
  }
  for (const [id, list] of replyTimes) {
    const sorted = [...list].sort((a, b) => a - b);
    stats.get(id)!.medianReplyMinutes = Math.round(sorted[Math.floor(sorted.length / 2)]);
  }
  return [...stats.values()];
}

export function renderLine(conv: Conversation, m: Message, prev: Message | null): string {
  const who = m.senderId === "system" ? "SYSTEM" : m.isSelf ? "ME" : `THEM (${conv.participants.find((p) => p.id === m.senderId)?.name ?? m.senderId})`;
  const t = parse(m.ts);
  const pt = prev ? parse(prev.ts) : null;
  const gap = t !== null && pt !== null && t >= pt ? ` | ${formatGap(t - pt)}` : "";
  let body = m.text.replace(/\n/g, " ⏎ ");
  if (m.kind !== "text") body = `<${m.kind}> ${body}`;
  if (m.replyTo !== undefined) body = `(replying to #${m.replyTo}) ${body}`;
  else if (m.replyQuote) body = `(replying to "${m.replyQuote.slice(0, 60)}") ${body}`;
  const extras: string[] = [];
  if (m.reactions?.length) extras.push(`reactions: ${m.reactions.map((r) => (r.by ? `${r.emoji} by ${r.by}` : r.emoji)).join(", ")}`);
  if (m.edited) extras.push("edited");
  if (m.readAfter) extras.push(`read after ${m.readAfter}`);
  return `[#${m.i} | ${formatTs(m)}${gap} | ${who}] ${body}${extras.length ? ` {${extras.join("; ")}}` : ""}`;
}

export function renderTranscript(conv: Conversation): string {
  const header = [
    `# Conversation: ${conv.title ?? "untitled"} (${conv.source}${conv.isGroup ? ", group" : ", 1:1"})`,
    `# Participants: ${conv.participants.map((p) => (p.isSelf ? `${p.name} (ME)` : p.name)).join(", ")}`,
    `# Messages: ${conv.messages.length}${conv.messages.length ? `, ${conv.messages[0].ts ?? "?"} → ${conv.messages[conv.messages.length - 1].ts ?? "?"}` : ""}`,
    ...computeStats(conv).map(
      (s) => `# ${s.isSelf ? "ME" : s.name}: ${s.messages} msgs, ${s.words} words, started ${s.initiations} conversations, median reply ${s.medianReplyMinutes ?? "n/a"} min`,
    ),
    ...conv.warnings.map((w) => `# warning: ${w}`),
    "# Format: [#index | local time (~ = estimated) | gap since previous message | sender] text {reactions; edited; read receipts}",
    "",
  ];
  const lines = conv.messages.map((m, k) => renderLine(conv, m, k ? conv.messages[k - 1] : null));
  return [...header, ...lines].join("\n") + "\n";
}
