/**
 * The file the Textrovert Mac app saves with "Save for iPhone" (described in mac/README.md): every iMessage chat, each
 * with its messages oldest first. A message's from is missing when you sent it, and for system notices.
 */
export interface MessagesFile {
  format: 'textrovert-messages';
  version: number;
  /** Seconds since 1970. */
  exportedAt: number;
  chats: Chat[];
}

export interface Chat {
  id: string;
  title: string;
  group: boolean;
  /** Everyone in the chat but you. */
  people: string[];
  messages: Message[];
}

export interface Message {
  /** Seconds since 1970. */
  t: number;
  from?: string;
  text?: string;
  /** Missing for text; otherwise photo, video, gif, audio, sticker, location, contact, file, deleted or system. */
  kind?: string;
  /** Tapbacks as [sender, emoji]; the sender is "Me" for yours. */
  reactions?: [string, string][];
}

export function readMessagesFile(json: string): MessagesFile {
  let file: Partial<MessagesFile> | undefined;
  try {
    file = JSON.parse(json);
  } catch {}
  if (!file || file.format !== 'textrovert-messages' || !Array.isArray(file.chats)) {
    throw new Error("That isn't a Textrovert messages file. On your Mac, open Textrovert, click Save for iPhone, and send the file it saves.");
  }
  if (file.version !== 1) throw new Error('That file comes from a newer Textrovert Mac app. Update Textrovert on this phone, then import it again.');
  return file as MessagesFile;
}

export const chatName = (chat: Chat) => chat.title || chat.people.join(', ');

export interface Person {
  id: string;
  name: string;
  messages: number;
  fromYou: number;
  /** The most days in a row with at least one message. */
  streak: number;
  /** Seconds since 1970. */
  since: number;
}

export interface TextingStats {
  messages: number;
  sent: number;
  chats: number;
  /** The first message's time, in seconds since 1970. */
  since?: number;
  /** One-to-one chats with the most messages, at most eight. */
  people: Person[];
  loudestGroup?: { name: string; messages: number };
  /** 0–23, in this device's time zone. */
  busiestHour?: number;
  biggestDay?: { date: Date; messages: number; mostlyWith: string };
  longestStreak?: { days: number; name: string };
  topEmoji: { emoji: string; count: number }[];
  /** Your messages with lol, haha, 😂 or 🤣, plus your Ha Ha tapbacks. */
  laughs: number;
  /** The share of your messages sent between midnight and 5 AM. */
  lateNight: number;
}

const counts = (m: Message) => m.kind !== 'system' && m.kind !== 'deleted';
const mine = (m: Message) => m.from === undefined && m.kind !== 'system';
const EMOJI = /(?:[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]\uFE0F?)[\u{1F3FB}-\u{1F3FF}]?/gu;
const LAUGH = /\b(?:lol+|lmf?ao+|rofl|(?:ha){2,}h?|(?:he){2,}h?)\b|\u{1F602}|\u{1F923}/iu;

/** A local calendar day as a whole number, so consecutive days differ by one. */
function dayNumber(date: Date) {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function longestRun(days: Set<number>) {
  let best = 0;
  for (const day of days) {
    if (days.has(day - 1)) continue;
    let length = 1;
    while (days.has(day + length)) length++;
    best = Math.max(best, length);
  }
  return best;
}

/** Fun numbers from an imported history, counted in this device's time zone. */
export function textingStats(file: MessagesFile): TextingStats {
  const stats: TextingStats = { messages: 0, sent: 0, chats: 0, people: [], topEmoji: [], laughs: 0, lateNight: 0 };
  const hours = new Array<number>(24).fill(0);
  const perDay = new Map<number, number>();
  const emoji = new Map<string, number>();
  const people: Person[] = [];
  let lateNight = 0;
  let since = Infinity;

  for (const chat of file.chats) {
    let count = 0;
    let fromYou = 0;
    let first = Infinity;
    const days = new Set<number>();
    for (const m of chat.messages) {
      for (const [who, e] of m.reactions ?? []) if (who === 'Me' && e === '\u{1F602}') stats.laughs++;
      if (!counts(m)) continue;
      const date = new Date(m.t * 1000);
      const day = dayNumber(date);
      const hour = date.getHours();
      count++;
      hours[hour]++;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      days.add(day);
      first = Math.min(first, m.t);
      if (!mine(m)) continue;
      fromYou++;
      if (hour < 5) lateNight++;
      if (!m.text) continue;
      for (const [e] of m.text.matchAll(EMOJI)) emoji.set(e, (emoji.get(e) ?? 0) + 1);
      if (LAUGH.test(m.text)) stats.laughs++;
    }
    if (count === 0) continue;
    stats.chats++;
    stats.messages += count;
    stats.sent += fromYou;
    since = Math.min(since, first);
    const name = chatName(chat);
    const streak = longestRun(days);
    if (chat.group) {
      if (count > (stats.loudestGroup?.messages ?? 0)) stats.loudestGroup = { name, messages: count };
    } else {
      people.push({ id: chat.id, name, messages: count, fromYou, streak, since: first });
    }
    if (streak >= 2 && streak > (stats.longestStreak?.days ?? 0)) stats.longestStreak = { days: streak, name };
  }
  if (stats.messages === 0) return stats;

  stats.since = since;
  stats.people = people.sort((a, b) => b.messages - a.messages).slice(0, 8);
  stats.busiestHour = hours.indexOf(Math.max(...hours));
  stats.lateNight = stats.sent ? lateNight / stats.sent : 0;
  stats.topEmoji = [...emoji].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, count]) => ({ emoji: e, count }));

  let [bestDay, bestCount] = [0, 0];
  for (const [day, n] of perDay) if (n > bestCount) [bestDay, bestCount] = [day, n];
  const start = new Date(bestDay * 86_400_000);
  const date = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  let mostlyWith = '';
  let most = 0;
  for (const chat of file.chats) {
    const n = chat.messages.filter((m) => counts(m) && dayNumber(new Date(m.t * 1000)) === bestDay).length;
    if (n > most) [mostlyWith, most] = [chatName(chat), n];
  }
  stats.biggestDay = { date, messages: bestCount, mostlyWith };
  return stats;
}
