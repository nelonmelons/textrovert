import { useSyncExternalStore } from 'react';

import type { Person } from '@/lib/api';

/** Who Ask is about, shared so other tabs (Friends) can open Ask scoped to someone. */
let scope: Person | null = null;
const listeners = new Set<() => void>();

export function setAskScope(person: Person | null) {
  scope = person;
  listeners.forEach((l) => l());
}

export const useAskScope = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => scope,
    () => scope,
  );
