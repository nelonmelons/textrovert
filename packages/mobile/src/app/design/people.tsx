import { MockupShell } from '@/design/mockups/MockupShell';
import { PeopleMockup } from '@/design/mockups/People';

export default function PeopleDesignRoute() {
  return (
    <MockupShell tab="people">
      {(tabBar) => <PeopleMockup tabBar={tabBar} />}
    </MockupShell>
  );
}
