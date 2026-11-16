import { DesignFonts, Screen } from '@/design';
import { PeopleList } from '../../features/people/PeopleList';

/** People: everyone you text, with the social graph (the portrait's orbit) one tap away. */
export default function People() {
  return (
    <DesignFonts>
      <Screen>
        <PeopleList />
      </Screen>
    </DesignFonts>
  );
}
