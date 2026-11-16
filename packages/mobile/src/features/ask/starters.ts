import { firstName } from '@/lib/answer';

export interface Starter {
  emoji: string;
  question: string;
  detail: string;
}

/** Starter questions for an empty Ask chat, general or about one friend (their name comes from the data). */
export function starters(person: string | null): Starter[] {
  if (!person) {
    return [
      { emoji: '🗓️', question: "What's coming up this week?", detail: 'Plans and dates from every chat' },
      { emoji: '👋', question: "Who haven't I talked to in a while?", detail: 'Friends worth a hello' },
      { emoji: '🤞', question: 'Did I promise anyone anything?', detail: "Things you said you'd do" },
      { emoji: '✈️', question: 'What are my group chats planning?', detail: 'Trips, dinners and meetups' },
    ];
  }
  const name = firstName(person);
  return [
    { emoji: '✨', question: `What's new with ${name}?`, detail: 'The latest from your chats' },
    { emoji: '💬', question: `What do ${name} and I always talk about?`, detail: 'Your running topics' },
    { emoji: '🗓️', question: `Any plans with ${name} coming up?`, detail: "Dates you've talked about" },
    { emoji: '🧵', question: `What should I ask ${name} about next?`, detail: 'Threads worth picking up' },
  ];
}
