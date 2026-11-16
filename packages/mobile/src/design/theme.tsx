import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { palette, shadows, type Scheme } from './tokens';

const SchemeContext = createContext<Scheme | null>(null);

/** Forces a colour scheme for everything inside, e.g. to show light and dark side by side. */
export function SchemeProvider({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return <SchemeContext.Provider value={scheme}>{children}</SchemeContext.Provider>;
}

/** The active scheme's colours and shadows: a forced scheme if one is set, the system's otherwise. */
export function useDesign() {
  const forced = useContext(SchemeContext);
  const system = useColorScheme();
  const scheme: Scheme = forced ?? (system === 'dark' ? 'dark' : 'light');
  return { scheme, c: palette[scheme], shadow: shadows[scheme] };
}
