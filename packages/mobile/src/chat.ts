import { Friend, firstName, friends } from './fixtures';

export const MiaConversation = {
  question: 'Is Mia upset that I told her late I could only stay an hour?',
  first: 'Are we still on for six?',
  middle: 'Sorry, I forgot to mention I can only stay an hour tonight.',
  last: 'I wish you’d told me sooner',
  reply: 'I should’ve let you know sooner. Does six still work?',
};

export type Turn = {
  id: string;
  fromMe: boolean;
  text: string;
  detail?: string;
  image?: string;
  kind?: 'text' | 'analysis' | 'clarify' | 'noAnswer' | 'photo';
  about?: string;
};

let counter = 0;
export const turn = (t: Omit<Turn, 'id'>): Turn => ({ id: `t${++counter}`, ...t });

const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}+]+/u).filter(Boolean));
const hasAny = (set: Set<string>, list: string[]) => list.some((w) => set.has(w));

export function looksLikeQuestion(query: string) {
  const text = query.trim().toLowerCase();
  const first = text.split(' ')[0] ?? '';
  return text.endsWith('?') || ['who', 'who’s', "who's", 'what', 'what’s', 'when', 'where', 'why', 'how', 'is', 'are', 'does', 'do', 'should', 'can', 'will', 'did', 'tell', 'help', 'remind', 'give', 'find'].includes(first);
}

export function subjectOf(question: string, friend?: Friend) {
  const set = words(question);
  if (friend) return set.has(firstName(friend).toLowerCase()) || hasAny(set, ['she', 'her', 'he', 'him', 'they', 'them']) ? friend : undefined;
  return friends.find((f) => set.has(firstName(f).toLowerCase()));
}

function overallAnswer(set: Set<string>, subject?: Friend): Turn | undefined {
  const about = (ids: string[]) => (subject ? ids.includes(subject.id) : true);
  if (hasAny(set, ['volleyball', 'vb', 'sports', 'play']) && about(['mia', 'jules']))
    return turn({ fromMe: false, text: 'Mia and Jules! Mia told me to ask her next time you need a +1 for VB.', detail: 'Jules has been playing volleyball at the park on weekends, too.' });
  if (hasAny(set, ['reply', 'respond', 'waiting', 'answer', 'confirm', 'owe']) && about(['sarah']))
    return turn({ fromMe: false, text: 'Sarah’s waiting on you. She asked you to confirm brunch by 5 PM today.', detail: 'She’ll book the table at Juniper once you say yes.' });
  if (hasAny(set, ['birthday', 'birthdays', 'gift', 'present', 'get']) && about(['mia']))
    return turn({ fromMe: false, text: 'Mia’s birthday is November 16! She’s been really into jasmine tea lately.', detail: 'A nice jasmine tea could be a sweet gift.' });
  if (hasAny(set, ['plans', 'plan', 'week', 'weekend', 'busy', 'schedule']) && about(['mia', 'sarah']))
    return turn({ fromMe: false, text: 'You’re shopping with Mia on Thursday at 4, then brunch with Sarah on Friday at 11.', detail: 'Sarah’s brunch isn’t confirmed yet.' });
  return undefined;
}

export function reply(question: string, opts: { friend?: Friend; image?: string; includeHistory: boolean; subject?: Friend }): Turn {
  const { friend, image, includeHistory, subject } = opts;
  if (image) {
    const name = subject ? firstName(subject) : 'your friends';
    return turn({
      fromMe: false,
      kind: 'photo',
      text: 'Got your photo! I can’t look at photos yet.',
      detail: includeHistory
        ? `Once photo answers are switched on, I’ll read it next to your chats with ${name}. It stays on your phone for now.`
        : 'Once photo answers are switched on, I’ll read just this photo. It stays on your phone for now.',
    });
  }
  const set = words(question);
  const aboutMia =
    question.trim().toLowerCase() === MiaConversation.question.toLowerCase() || (!friend && set.has('mia') && hasAny(set, ['upset', 'mad', 'bothered', 'annoyed', 'hurt']));
  if (aboutMia && (!friend || friend.id === 'mia'))
    return turn({ fromMe: false, kind: 'analysis', text: 'I think the late notice is the part that bothered her.', detail: 'She wrote “I wish you’d told me sooner” right after you said you could only stay an hour.' });
  if (!friend) {
    const answer = overallAnswer(set, subject);
    if (answer) return answer;
  }
  if (subject)
    return turn({ fromMe: false, kind: 'noAnswer', text: `I can’t answer questions like that about ${firstName(subject)} yet.`, detail: 'Answers will come from your conversations once they’re connected.' });
  return turn({ fromMe: false, kind: 'noAnswer', text: 'I can’t answer that one yet.', detail: 'Try asking who’s up for volleyball, who’s waiting on you, or what to get Mia.' });
}
