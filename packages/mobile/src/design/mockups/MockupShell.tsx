import type { ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { SchemeProvider, TabBar, type Scheme } from '@/design';
import { tabs } from './data';

/**
 * Hands a mockup its floating tab bar to place in its Screen overlay (under any sheet); ?scheme=light|dark forces a
 * colour scheme.
 */
export function MockupShell({ tab, children }: { tab: string; children: (tabBar: ReactNode) => ReactNode }) {
  const { scheme } = useLocalSearchParams<{ scheme?: Scheme }>();
  const body = children(<TabBar tabs={tabs} active={tab} onChange={(key) => router.replace({ pathname: `/design/${key}` as never, params: scheme ? { scheme } : {} })} />);
  return scheme === 'light' || scheme === 'dark' ? <SchemeProvider scheme={scheme}>{body}</SchemeProvider> : <>{body}</>;
}
