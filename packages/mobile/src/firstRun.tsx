import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Theme } from './theme';

export type MessagesExport = { name: string; size?: number };
type Saved = { done: boolean; messagesExport?: MessagesExport; contactsOptIn: boolean };
type FirstRun = Saved & { finish: (choices: Omit<Saved, 'done'>) => Promise<void>; reset: () => Promise<void> };

const KEY = 'textrovert.setup.v1';
const initial: Saved = { done: false, contactsOptIn: false };
const FirstRunContext = createContext<FirstRun | null>(null);

export function FirstRunProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>();

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => setSaved(raw ? { ...initial, ...JSON.parse(raw) } : initial));
  }, []);

  const value = useMemo<FirstRun | null>(
    () =>
      saved
        ? {
            ...saved,
            finish: async (choices) => {
              const next = { ...choices, done: true };
              await AsyncStorage.setItem(KEY, JSON.stringify(next));
              setSaved(next);
            },
            reset: async () => {
              await AsyncStorage.removeItem(KEY);
              setSaved(initial);
            },
          }
        : null,
    [saved],
  );

  if (!value) return <View style={{ flex: 1, backgroundColor: Theme.paper }} />;
  return <FirstRunContext.Provider value={value}>{children}</FirstRunContext.Provider>;
}

export function useFirstRun() {
  const value = useContext(FirstRunContext);
  if (!value) throw new Error('useFirstRun needs FirstRunProvider');
  return value;
}
