import { useEffect, useState } from 'react';

import { fetchPeople, type Person } from '@/lib/api';

/** Friends worth offering as a scope: anyone with a DM, or anyone sharing a lot of group messages. */
const MIN_SHARED_MESSAGES = 1000;
export const pickable = (people: Person[]) => people.filter((p) => p.dm || p.messages >= MIN_SHARED_MESSAGES);

type State = { status: 'loading' } | { status: 'ready'; people: Person[] } | { status: 'error'; message: string };
let cached: Promise<Person[]> | null = null;

/** The friend list from the Ask API, fetched once per app session and shared by every screen. */
export function usePeople(): State & { retry: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    cached ??= fetchPeople().then(pickable);
    cached.then(
      (people) => live && setState({ status: 'ready', people }),
      (error: Error) => {
        cached = null;
        if (live) setState({ status: 'error', message: error.message });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return { ...state, retry: () => (setState({ status: 'loading' }), setAttempt((a) => a + 1)) };
}
