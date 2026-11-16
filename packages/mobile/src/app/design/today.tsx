import { MockupShell } from '@/design/mockups/MockupShell';
import { TodayMockup } from '@/design/mockups/Today';

export default function TodayDesignRoute() {
  return (
    <MockupShell tab="today">
      {(tabBar) => <TodayMockup tabBar={tabBar} />}
    </MockupShell>
  );
}
