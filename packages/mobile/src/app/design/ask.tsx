import { useLocalSearchParams } from 'expo-router';

import { AskMockup } from '@/design/mockups/Ask';
import { MockupShell } from '@/design/mockups/MockupShell';

export default function AskDesignRoute() {
  const { sheet } = useLocalSearchParams<{ sheet?: string }>();
  return (
    <MockupShell tab="ask">
      {(tabBar) => <AskMockup sheetOpen={sheet === '1'} tabBar={tabBar} />}
    </MockupShell>
  );
}
