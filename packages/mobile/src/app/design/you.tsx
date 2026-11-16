import { MockupShell } from '@/design/mockups/MockupShell';
import { YouMockup } from '@/design/mockups/You';

export default function YouDesignRoute() {
  return (
    <MockupShell tab="you">
      {(tabBar) => <YouMockup tabBar={tabBar} />}
    </MockupShell>
  );
}
