import type { Conversation, DraftMessage, Message, Participant, Source } from "./types.ts";

export const SYSTEM_SENDER = "system";

function slug(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || "unknown";
}

export function buildConversation(
  source: Source,
  title: string | null,
  drafts: DraftMessage[],
  warnings: string[],
): Conversation {
  const participants = new Map<string, Participant>();
  const idFor = (draft: DraftMessage): string => {
    if (draft.sender === SYSTEM_SENDER) return SYSTEM_SENDER;
    if (draft.isSelf) {
      if (!participants.has("me")) participants.set("me", { id: "me", name: draft.sender, isSelf: true });
      return "me";
    }
    const id = slug(draft.sender);
    if (!participants.has(id)) participants.set(id, { id, name: draft.sender, isSelf: false });
    return id;
  };

  const messages: Message[] = drafts.map((d, i) => {
    const m: Message = {
      i,
      ts: d.ts,
      tsConfidence: d.tsConfidence,
      senderId: idFor(d),
      isSelf: d.isSelf,
      kind: d.kind,
      text: d.text,
      sourceRef: d.sourceRef,
    };
    if (d.replyToDraft !== undefined) m.replyTo = d.replyToDraft;
    if (d.replyQuote) m.replyQuote = d.replyQuote;
    if (d.reactions?.length) m.reactions = d.reactions;
    if (d.edited) m.edited = true;
    if (d.readAfter) m.readAfter = d.readAfter;
    return m;
  });

  const others = [...participants.values()].filter((p) => !p.isSelf);
  return {
    source,
    title: title ?? (others.length === 1 ? others[0].name : null),
    isGroup: others.length > 1,
    participants: [...participants.values()],
    messages,
    warnings,
  };
}

export function reassignSelf(conversation: Conversation, selfName: string): Conversation {
  const target = conversation.participants.find((p) => p.name.toLowerCase() === selfName.toLowerCase());
  if (!target) throw new Error(`No participant named "${selfName}". Options: ${conversation.participants.map((p) => p.name).join(", ")}`);
  return {
    ...conversation,
    participants: conversation.participants.map((p) => ({ ...p, isSelf: p.id === target.id })),
    messages: conversation.messages.map((m) => ({ ...m, isSelf: m.senderId === target.id })),
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

export function localIso(year: number, month: number, day: number, hour: number, minute: number, second = 0): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:${p(second)}`;
}

export function to24h(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const pm = meridiem.toLowerCase().startsWith("p");
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}
