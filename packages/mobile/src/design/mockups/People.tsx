import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AvatarStack, Chip, EmojiAvatar, LargeTitle, ListRow, ListSection, PressScale, Screen, SegmentedControl, TAB_BAR_SPACE, Txt, DarkCard, space } from '@/design';
import { friends } from './data';

export function PeopleMockup({ tabBar }: { tabBar?: ReactNode }) {
  const [seg, setSeg] = useState(0);
  return (
    <Screen grouped bottomInset={TAB_BAR_SPACE} overlay={tabBar}>
      <LargeTitle title="People" subtitle="Everyone you actually talk to." trailing={<EmojiAvatar emoji="🔍" color="white" size={40} />} />
      <SegmentedControl segments={['Close', 'Groups', 'Everyone']} value={seg} onChange={setSeg} />
      <PressScale onPress={() => {}} accessibilityLabel="Open your social graph">
        <DarkCard style={{ padding: space.xl, gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AvatarStack people={friends.map((f) => ({ name: f.name }))} size={40} max={5} />
            <Txt variant="title3" tone="onDark">
              →
            </Txt>
          </View>
          <View style={{ gap: 2 }}>
            <Txt variant="title2" tone="onDark">
              Your social graph 🕸️
            </Txt>
            <Txt variant="subhead" tone="onDarkMuted">
              See who connects your friend groups.
            </Txt>
          </View>
        </DarkCard>
      </PressScale>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="All" selected count={friends.length} />
        <Chip label="Owe a reply" emoji="⏳" count={2} />
        <Chip label="Birthdays" emoji="🎂" count={1} />
      </View>
      <ListSection header="Close friends" footer="Ordered by how much you've talked this month.">
        {friends.map((f) => (
          <ListRow key={f.name} title={f.name} subtitle={f.status} leading={<EmojiAvatar name={f.name} emoji={f.emoji} size={44} />} value={f.last} onPress={() => {}} />
        ))}
      </ListSection>
    </Screen>
  );
}
