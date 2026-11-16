import { createContext, ReactNode, useContext } from 'react';
import { API_URL } from './client';

type DataMode = {
  /** The API base, or '' when the bundle was built without EXPO_PUBLIC_API_URL. */
  apiUrl: string;
  /** True when screens should read the API. Without one, screens show their empty states. */
  live: boolean;
};

const value: DataMode = { apiUrl: API_URL, live: !!API_URL };
const DataModeContext = createContext<DataMode | null>(null);

/** Decides whether the whole app reads the live API. */
export function DataModeProvider({ children }: { children: ReactNode }) {
  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode() {
  const context = useContext(DataModeContext);
  if (!context) throw new Error('useDataMode needs DataModeProvider');
  return context;
}
