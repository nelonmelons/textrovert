import { Friend, friends } from './people';
import { Note } from './store';

export type ActivityMatch = { friend: Friend; item: Note; exact: boolean; term: string };

const aliases: Record<string, string> = { vb: 'volleyball', bball: 'basketball' };
const related: Record<string, string[]> = {
  sports: ['volleyball', 'basketball', 'tennis', 'soccer', 'climbing', 'running'],
  sport: ['volleyball', 'basketball', 'tennis', 'soccer', 'climbing', 'running'],
  outdoors: ['volleyball', 'hiking', 'climbing', 'running'],
  food: ['dumplings', 'brunch', 'dinner', 'tea'],
};
const ignored = new Set(['need', 'needs', 'a', 'an', 'the', 'for', 'to', 'with', 'and', 'or', 'plus', 'someone', 'somebody', 'anyone', 'who', 'wants', 'want', 'go', 'going', 'play', 'playing', 'partner', 'buddy', 'me', 'my', 'i', 'can', 'could', 'this', 'next', 'tomorrow', 'today', 'tonight', 'weekend', 'friend', 'friends', '1']);

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => aliases[w] ?? w);

export function friendMatches(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return friends.filter((f) => f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q)).map((friend) => ({ friend, reason: 'Name or handle matches' }));
}

export function activityMatches(query: string, together: (friend: Friend) => Note[]): ActivityMatch[] {
  const terms = words(query).filter((w) => !ignored.has(w) && w.length >= 2);
  if (terms.length === 0) return [];
  const found: ActivityMatch[] = [];
  for (const friend of friends) {
    for (const item of together(friend)) {
      const titleWords = words(item.title);
      const exact = terms.find((t) => titleWords.some((w) => w === t || (w.startsWith(t) && t.length >= 3)));
      if (exact) {
        found.push({ friend, item, exact: true, term: exact });
        continue;
      }
      const loose = terms.find((t) => (related[t] ?? []).some((r) => titleWords.includes(r)));
      if (loose) found.push({ friend, item, exact: false, term: loose });
    }
  }
  return found;
}
