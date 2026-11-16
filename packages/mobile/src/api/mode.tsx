import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { Theme } from '../theme';
import { BUILT_IN, fetchPeople, normalizeUrl, setConnection, type Connection } from './client';

type DataMode = {
  /** The server in use: the one you signed in to, else the built-in one, else '' (Emma's fixtures). */
  apiUrl: string;
  /** The server you signed in to on this phone, or null when using the built-in one or none. */
  account: { url: string } | null;
  /** Show Emma's fixtures even though an API is set up (the Demo data switch in Settings). */
  demo: boolean;
  /** True when screens should read the API: one is set up and demo data is off. */
  live: boolean;
  setDemo: (on: boolean) => Promise<void>;
  /** Checks the server and key with GET /people, then keeps them on this phone. Throws ApiError when they don't work. */
  signIn: (url: string, key: string) => Promise<number>;
  signOut: () => Promise<void>;
};

const KEY = 'textrovert.demo.v1';
const SIGN_IN_KEY = 'textrovert.signin.v1';

/** The sign-in lives in the Keychain; web has no Keychain, so it falls back to local storage there. */
const vault =
  Platform.OS === 'web'
    ? { get: () => AsyncStorage.getItem(SIGN_IN_KEY), set: (v: string) => AsyncStorage.setItem(SIGN_IN_KEY, v), remove: () => AsyncStorage.removeItem(SIGN_IN_KEY) }
    : { get: () => SecureStore.getItemAsync(SIGN_IN_KEY), set: (v: string) => SecureStore.setItemAsync(SIGN_IN_KEY, v), remove: () => SecureStore.deleteItemAsync(SIGN_IN_KEY) };

const DataModeContext = createContext<DataMode | null>(null);

/** Decides between the live API and Emma's fixtures for the whole app, and which server the API is. */
export function DataModeProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<boolean>();
  const [account, setAccount] = useState<Connection | null>(null);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(KEY).catch(() => null), vault.get().catch(() => null)]).then(([rawDemo, rawAccount]) => {
      const saved = rawAccount ? (JSON.parse(rawAccount) as Connection) : null;
      setConnection(saved ?? BUILT_IN);
      setAccount(saved);
      setDemo(rawDemo === '1');
    });
  }, []);

  const value = useMemo<DataMode | null>(() => {
    if (demo === undefined) return null;
    const apiUrl = (account ?? BUILT_IN).url;
    return {
      apiUrl,
      account: account ? { url: account.url } : null,
      demo,
      live: !!apiUrl && !demo,
      setDemo: async (on) => {
        setDemo(on);
        await AsyncStorage.setItem(KEY, on ? '1' : '0');
      },
      signIn: async (url, key) => {
        const candidate = { url: normalizeUrl(url), key: key.trim() };
        const people = await fetchPeople(candidate);
        await vault.set(JSON.stringify(candidate));
        await AsyncStorage.setItem(KEY, '0');
        setConnection(candidate);
        setAccount(candidate);
        setDemo(false);
        return people.length;
      },
      signOut: async () => {
        await vault.remove();
        setConnection(BUILT_IN);
        setAccount(null);
      },
    };
  }, [demo, account]);

  if (!value) return <View style={{ flex: 1, backgroundColor: Theme.paper }} />;
  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode() {
  const value = useContext(DataModeContext);
  if (!value) throw new Error('useDataMode needs DataModeProvider');
  return value;
}
