import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Friend, friendById, friends as fixtureFriends } from '../people';
import { formatAgo } from '../lib/answer';
import { fetchPeople, type Person } from './client';
import { fetchToday, type Today } from './friend';
import { loadOwnerKey } from './owner';
import { useDataMode } from './mode';
import { useFirstRun } from '../firstRun';

/** Friends worth listing: anyone with a DM, or anyone sharing a lot of group messages. */
const MIN_SHARED_MESSAGES = 1000;
export const pickable = (people: Person[]) => people.filter((p) => p.dm || p.messages >= MIN_SHARED_MESSAGES);

type State = { status: 'loading' } | { status: 'ready'; people: Person[] } | { status: 'error'; message: string };
let cached: { ownerKey: string | null; people: Promise<Person[]> } | null = null;

/** The friend list from GET /people, fetched once per owner key and shared by every screen. Idle when not live. */
export function usePeople(enabled = true): State & { retry: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadOwnerKey().then((ownerKey) => {
      if (cached?.ownerKey !== ownerKey) cached = { ownerKey, people: fetchPeople().then(pickable) };
      const mine = cached;
      mine.people.then(
        (people) => live && setState({ status: 'ready', people }),
        (error: Error) => {
          if (cached === mine) cached = null;
          if (live) setState({ status: 'error', message: error.message });
        },
      );
    });
    return () => {
      live = false;
    };
  }, [attempt, enabled]);
  return { ...state, retry: () => (setState({ status: 'loading' }), setAttempt((a) => a + 1)) };
}

type TodayState = { status: 'loading' } | { status: 'ready'; today: Today } | { status: 'error'; message: string };

/**
 * Replies you owe and upcoming plans from GET /today, refetched whenever the screen comes into focus so they fill in
 * as a new upload finishes indexing. A failed refetch keeps what was already shown. Idle when not live.
 */
export function useToday(enabled = true): TodayState {
  const [state, setState] = useState<TodayState>({ status: 'loading' });
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let live = true;
      fetchToday().then(
        (today) => live && setState({ status: 'ready', today }),
        (error: Error) => live && setState((s) => (s.status === 'ready' ? s : { status: 'error', message: error.message })),
      );
      return () => {
        live = false;
      };
    }, [enabled]),
  );
  return state;
}

export const initials = (name: string) =>
  /\p{L}/u.test(name)
    ? name
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => [...w][0]?.toUpperCase() ?? '')
        .join('')
    : '#';

/** Calling codes with two digits (ITU E.164 zones 2-9); the rest of those zones use three. */
const TWO_DIGIT_COUNTRY = /^(2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])/;

/**
 * How a person's name reads in the app. Exports without a contact name carry the bare handle, so a phone number is
 * spaced out ("+1 (415) 555-0123"); names and emails stay as they are. The raw name is still the id /friend and /ask take.
 */
export function contactName(name: string) {
  if (!/^\+?[\d\s().-]{7,}$/.test(name)) return name;
  const digits = name.replace(/\D/g, '');
  const us = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.length === 10 && !name.startsWith('+') ? digits : null;
  if (us) return `${name.startsWith('+') || digits.length === 11 ? '+1 ' : ''}(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
  if (!name.startsWith('+')) return name;
  const cc = digits[0] === '7' || digits[0] === '1' ? 1 : TWO_DIGIT_COUNTRY.test(digits) ? 2 : 3;
  return `+${digits.slice(0, cc)} ${digits.slice(cc).replace(/(\d{3})(?=\d{4})/g, '$1 ')}`;
}

/** "DM · 3 shared groups · Yesterday": what a live friend's profile shows where a fixture shows the handle. */
export function personLine(p: Person) {
  const groups = p.chats - (p.dm ? 1 : 0);
  return [p.dm ? 'DM' : 'Groups only', groups > 0 ? groups + (groups === 1 ? ' shared group' : ' shared groups') : '', formatAgo(p.lastAt)].filter(Boolean).join(' · ');
}

/** A person from the API in the shape Emma's screens use. Their id is their name, which is what /ask and /friend take. */
export const personFriend = (p: Person): Friend => ({ id: p.name, name: contactName(p.name), handle: personLine(p), initials: initials(p.name), messages: [], notes: [], person: p });

type Friends = { status: 'loading' | 'ready' | 'error'; friends: Friend[]; message?: string; retry: () => void };

/** Everyone the app knows: people from the API when live, Emma's fixtures otherwise. */
export function useFriends(): Friends {
  const { live } = useDataMode();
  const { done } = useFirstRun();
  // Before onboarding there is no owner key, and the hosted API would answer with its demo owner's people.
  const people = usePeople(live && done);
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
