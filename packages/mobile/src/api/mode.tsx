import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Theme } from '../theme';
import { API_URL } from './client';

type DataMode = {
  /** The API base, or '' when the bundle was built without EXPO_PUBLIC_API_URL. */
  apiUrl: string;
  /** Show Emma's fixtures even though an API is set up (the Demo data switch in Settings). */
  demo: boolean;
  /** True when screens should read the API: one is set up and demo data is off. */
  live: boolean;
  setDemo: (on: boolean) => Promise<void>;
};

const KEY = 'textrovert.demo.v1';
const DataModeContext = createContext<DataMode | null>(null);

/** Decides between the live API and Emma's fixtures for the whole app. */
export function DataModeProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<boolean>();

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setDemo(raw === '1'))
      .catch(() => setDemo(false));
  }, []);

  const value = useMemo<DataMode | null>(
    () =>
      demo === undefined
        ? null
        : {
            apiUrl: API_URL,
            demo,
            live: !!API_URL && !demo,
            setDemo: async (on) => {
              setDemo(on);
              await AsyncStorage.setItem(KEY, on ? '1' : '0');
            },
          },
    [demo],
  );

  if (!value) return <View style={{ flex: 1, backgroundColor: Theme.paper }} />;
  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode() {
  const value = useContext(DataModeContext);
  if (!value) throw new Error('useDataMode needs DataModeProvider');
  return value;
}
