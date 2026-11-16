import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { EmojiAvatar, LargeTitle, ListRow, ListSection, Screen, SectionTitle, SegmentedControl, StatCard, TAB_BAR_SPACE, TileGrid, Txt, space } from '@/design';
import { hedgehog, topics } from './data';

export function YouMockup({ tabBar }: { tabBar?: ReactNode }) {
  const [range, setRange] = useState(1);
  return (
    <Screen bottomInset={TAB_BAR_SPACE} overlay={tabBar}>
      <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.lg }}>
        <EmojiAvatar image={hedgehog.reader} color="lilac" size={96} name="You" />
        <LargeTitle center title="Your year in texts" subtitle="You're the one who keeps the group chat alive." />
      </View>
      <SegmentedControl segments={['Month', 'Year', 'All time']} value={range} onChange={setRange} />
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatCard value="48K" label="Messages sent" emoji="📤" color="mint" />
          <StatCard value="212" label="People" emoji="👯" color="pink" />
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatCard value="11pm" label="Peak hour" emoji="🌙" color="lilac" />
          <StatCard value="😂" label="Top emoji" emoji="🏆" color="yellow" />
        </View>
      </View>
      <SectionTitle title="What you talk about" />
      <TileGrid items={topics} footer="And 38 smaller topics." />
      <ListSection header="Breakdown">
        <ListRow title="Replies within 5 min" leading={<EmojiAvatar emoji="⚡️" color="yellow" size={36} />} value="64%" />
        <ListRow title="Voice notes" leading={<EmojiAvatar emoji="🎙️" color="coral" size={36} />} value="318" />
        <ListRow title="Longest streak" leading={<EmojiAvatar emoji="🔥" color="peach" size={36} />} value="41 days" />
      </ListSection>
      <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
        Counted on this phone from your exported chats.
      </Txt>
    </Screen>
  );
}
