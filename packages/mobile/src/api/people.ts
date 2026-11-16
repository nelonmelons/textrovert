import { useEffect, useState } from 'react';
import { Friend, friendById, friends as fixtureFriends } from '../fixtures';
import { formatAgo } from '../lib/answer';
import { fetchPeople, type Person } from './client';
import { useDataMode } from './mode';

/** Friends worth listing: anyone with a DM, or anyone sharing a lot of group messages. */
const MIN_SHARED_MESSAGES = 1000;
export const pickable = (people: Person[]) => people.filter((p) => p.dm || p.messages >= MIN_SHARED_MESSAGES);

type State = { status: 'loading' } | { status: 'ready'; people: Person[] } | { status: 'error'; message: string };
let cached: { url: string; people: Promise<Person[]> } | null = null;

/** The friend list from GET /people, fetched once per server and shared by every screen. Idle when not live. */
export function usePeople(enabled = true): State & { retry: () => void } {
  const { apiUrl } = useDataMode();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    if (cached?.url !== apiUrl) cached = { url: apiUrl, people: fetchPeople().then(pickable) };
    const mine = cached;
    mine.people.then(
      (people) => live && setState({ status: 'ready', people }),
      (error: Error) => {
        if (cached === mine) cached = null;
        if (live) setState({ status: 'error', message: error.message });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt, enabled, apiUrl]);
  return { ...state, retry: () => (setState({ status: 'loading' }), setAttempt((a) => a + 1)) };
}

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('') || '#';

/** "DM · 3 shared groups · Yesterday": what a live friend's profile shows where a fixture shows the handle. */
export function personLine(p: Person) {
  const groups = p.chats - (p.dm ? 1 : 0);
  return [p.dm ? 'DM' : 'Groups only', groups > 0 ? groups + (groups === 1 ? ' shared group' : ' shared groups') : '', formatAgo(p.lastAt)].filter(Boolean).join(' · ');
}

/** A person from the API in the shape Emma's screens use. Their id is their name, which is what /ask and /friend take. */
export const personFriend = (p: Person): Friend => ({ id: p.name, name: p.name, handle: personLine(p), initials: initials(p.name), messages: [], notes: [], person: p });

type Friends = { status: 'loading' | 'ready' | 'error'; friends: Friend[]; message?: string; retry: () => void };

/** Everyone the app knows: people from the API when live, Emma's fixtures otherwise. */
export function useFriends(): Friends {
  const { live } = useDataMode();
  const people = usePeople(live);
  if (!live) return { status: 'ready', friends: fixtureFriends, retry: () => {} };
  if (people.status === 'ready') return { status: 'ready', friends: people.people.map(personFriend), retry: people.retry };
  return { status: people.status, friends: [], message: people.status === 'error' ? people.message : undefined, retry: people.retry };
}

/** One friend by route id: a fixture id like "mia" in demo mode, a person's name when live. */
export function useFriend(id: string | string[] | undefined): { status: Friends['status']; friend?: Friend; message?: string; retry: () => void } {
  const { live } = useDataMode();
  const all = useFriends();
  const key = Array.isArray(id) ? id[0] : id;
  if (!live) return { status: 'ready', friend: friendById(key), retry: all.retry };
  return { ...all, friend: all.friends.find((f) => f.id === key) };
}
