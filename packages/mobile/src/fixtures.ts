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
};

export const firstName = (friend: Friend) => friend.name.split(' ')[0];

export const friends: Friend[] = [
  {
    id: 'mia',
    name: 'Mia Chen',
    handle: '@mia.c',
    initials: 'MC',
    messages: [
      { id: 'shopping', service: 'iMessage', date: 'Nov 14 · 4:12 PM', text: "See you Thursday at 4 for shopping. Let's meet at the bookstore." },
      { id: 'volleyball', service: 'iMessage', date: 'Nov 12 · 6:20 PM', text: 'I love volleyball! Next time you need a +1 for VB, ask me.' },
      { id: 'tea', service: 'iMessage', date: 'Nov 10 · 9:15 AM', text: "My birthday is November 16. I've been really into jasmine tea lately." },
      { id: 'memory', service: 'iMessage', date: 'Oct 3 · 8:41 PM', text: "Still thinking about those night market dumplings. Best ones I've ever had." },
    ],
    birthday: { year: 0, month: 11, day: 16, sourceID: 'tea' },
    notes: [
      { id: 'shopping', section: 'plans', title: 'Shopping · Thursday, 4 PM', detail: 'Bookstore', sourceID: 'shopping' },
      { id: 'volleyball', section: 'together', title: 'Volleyball', detail: 'Said to ask her next time you need a +1', sourceID: 'volleyball' },
      { id: 'memory', section: 'memories', title: 'Night market dumplings', detail: 'She called them the best she’s ever had', sourceID: 'memory' },
      { id: 'tea', section: 'gifts', title: 'Jasmine tea', detail: 'She’s been really into it lately', sourceID: 'tea' },
    ],
  },
  {
    id: 'sarah',
    name: 'Sarah Park',
    handle: '@sarahp',
    initials: 'SP',
    messages: [
      { id: 'brunch', service: 'Instagram', date: 'Nov 14 · 11:08 AM', text: 'Brunch Friday at 11 at Juniper?' },
      { id: 'reply', service: 'Instagram', date: 'Nov 15 · 10:30 AM', text: "Can you confirm brunch by 5 PM today? I'll book the table." },
      { id: 'first', service: 'Instagram', date: 'Nov 18, 2025 · 9:02 PM', text: 'So nice meeting you tonight! We should get brunch sometime.' },
    ],
    firstMessage: { year: 2025, month: 11, day: 18, sourceID: 'first' },
    notes: [
      { id: 'reply', section: 'reply', title: 'Confirm brunch', detail: 'She’s booking Juniper for Friday at 11', sourceID: 'reply', deadline: new Date(2026, 10, 15, 17) },
      { id: 'brunch', section: 'plans', title: 'Brunch · Friday, 11 AM', detail: 'Juniper · Not confirmed yet', sourceID: 'brunch' },
    ],
  },
  {
    id: 'jules',
    name: 'Jules Rivera',
    handle: '@julesr',
    initials: 'JR',
    messages: [{ id: 'volleyball', service: 'WhatsApp', date: 'Nov 11 · 7:02 PM', text: "I've been playing volleyball at the park on weekends." }],
    notes: [{ id: 'volleyball', section: 'together', title: 'Volleyball', detail: 'Plays at the park on weekends', sourceID: 'volleyball' }],
  },
];

export const notes = (friend: Friend, section: NoteSection) => friend.notes.filter((n) => n.section === section);

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
