import { firstName } from '@/lib/answer';

/** Starter questions for an empty Ask chat, general or about one friend. */
export function starters(person: string | null): { question: string; detail: string }[] {
  if (!person) {
    return [
      { question: "What's coming up this week?", detail: 'Plans across all your chats' },
      { question: 'Who should I catch up with?', detail: 'Friends you have drifted from' },
      { question: 'What did my group chats plan lately?', detail: 'Trips, dinners and meetups' },
    ];
  }
  const name = firstName(person);
  return [
    { question: `What are ${name} and I always talking about?`, detail: `From your chats with ${name}` },
    { question: `What's new with ${name}?`, detail: 'Recent news and updates' },
    { question: `Any plans with ${name} coming up?`, detail: 'Upcoming plans and dates' },
  ];
}
