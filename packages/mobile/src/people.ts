import type { Person } from './api/client';

export type SourceMessage = { id: string; service: 'iMessage' | 'Instagram' | 'WhatsApp'; date: string; text: string };
export type DayMark = { year: number; month: number; day: number; sourceID: string };
export type NoteSection = 'reply' | 'plans' | 'together' | 'memories' | 'gifts';
export type NoteItem = { id: string; section: NoteSection; title: string; detail: string; sourceID?: string; deadline?: Date };

export type Friend = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  messages: SourceMessage[];
  birthday?: DayMark;
  firstMessage?: DayMark;
  notes: NoteItem[];
  /** Set for people from the live API; they have no fixture messages or notes. */
  person?: Person;
};

export const firstName = (friend: Friend) => friend.name.split(' ')[0];

export const friends: Friend[] = [];

export const friendById = (id: string | string[] | undefined) => friends.find((f) => f.id === id);

export const sectionOrder: NoteSection[] = ['reply', 'plans', 'together', 'memories', 'gifts'];

export const sectionInfo: Record<NoteSection, { title: string; noun: string; symbol: string; prompt: string; empty: (first: string) => string }> = {
  reply: { title: 'Needs a reply', noun: 'reply', symbol: 'arrowshape.turn.up.left.fill', prompt: 'What do you need to answer?', empty: () => 'Nothing waiting on you.' },
  plans: { title: 'Plans', noun: 'plan', symbol: 'calendar', prompt: 'Like “Dinner · Saturday, 7 PM”', empty: (f) => `No plans with ${f} yet.` },
  together: { title: 'Things to do together', noun: 'activity', symbol: 'figure.2', prompt: 'Like “Pottery class”', empty: (f) => `Nothing on your list with ${f} yet.` },
  memories: { title: 'Memories', noun: 'memory', symbol: 'book.closed.fill', prompt: 'Like “Road trip to Big Sur”', empty: () => 'No memories saved yet.' },
  gifts: { title: 'Gift ideas', noun: 'gift idea', symbol: 'gift.fill', prompt: 'Like “Jasmine tea”', empty: () => 'No gift ideas mentioned yet.' },
};

export type Milestone = {
  id: string;
  friend: Friend;
  kind: 'birthday' | 'friendship';
  years: number;
  date: Date;
  days: number;
  sourceID: string;
};

export function upcomingMilestones(now = new Date(), window = 7): Milestone[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = (month: number, day: number) => {
    let date = new Date(start.getFullYear(), month - 1, day);
    if (date < start) date = new Date(start.getFullYear() + 1, month - 1, day);
    const days = Math.round((date.getTime() - start.getTime()) / 86400000);
    return days <= window ? { date, days } : null;
  };
  const found: Milestone[] = [];
  for (const friend of friends) {
    if (friend.birthday) {
      const hit = next(friend.birthday.month, friend.birthday.day);
      if (hit) found.push({ id: `${friend.id}-birthday`, friend, kind: 'birthday', years: 0, ...hit, sourceID: friend.birthday.sourceID });
    }
    if (friend.firstMessage) {
      const hit = next(friend.firstMessage.month, friend.firstMessage.day);
      const years = hit ? hit.date.getFullYear() - friend.firstMessage.year : 0;
      if (hit && years >= 1) found.push({ id: `${friend.id}-friendship`, friend, kind: 'friendship', years, ...hit, sourceID: friend.firstMessage.sourceID });
    }
  }
  return found.sort((a, b) => a.days - b.days);
}

const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

export const milestoneHeadline = (m: Milestone) =>
  m.kind === 'birthday'
    ? `${firstName(m.friend)}’s birthday is ${when(m.days)}`
    : `${m.years} year${m.years === 1 ? '' : 's'} since you and ${firstName(m.friend)} first messaged`;

export function milestoneDateLine(m: Milestone) {
  const day = m.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (m.kind === 'birthday') return day;
  const w = when(m.days);
  return `${day} · ${w.charAt(0).toUpperCase()}${w.slice(1)}`;
}

export function deadlineText(deadline: Date, now = new Date()) {
  const time = deadline.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const remaining = deadline.getTime() - now.getTime();
  const sameDay = deadline.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString() === deadline.toDateString();
  const text =
    remaining <= 0
      ? `Asked for a reply by ${time}`
      : sameDay
        ? `Reply by ${time} today`
        : tomorrow
          ? `Reply by ${time} tomorrow`
          : `Reply by ${time}, ${deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return { text, urgent: remaining > 0 && remaining <= 2 * 3600 * 1000 };
}
