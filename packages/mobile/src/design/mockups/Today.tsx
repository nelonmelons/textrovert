import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AvatarStack, BigButton, EmojiAvatar, LargeTitle, ListRow, ListSection, Screen, SectionTitle, StatCard, TAB_BAR_SPACE, Txt, space } from '@/design';
import { heroStack, plans } from './data';

export function TodayMockup({ tabBar }: { tabBar?: ReactNode }) {
  return (
    <Screen bottomInset={TAB_BAR_SPACE} overlay={tabBar}>
      <View style={{ alignItems: 'center', gap: space.xxl, paddingTop: space.xxl }}>
        <AvatarStack people={heroStack} size={52} bounce />
        <LargeTitle center size="display" eyebrow="Saturday, Nov 15" title="Your people had a big week." subtitle="3 plans brewing, 1 birthday, and someone is waiting on you." />
      </View>
      <SectionTitle title="What's up this week" />
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatCard value="1,284" label="Messages" emoji="💬" color="mint" onPress={() => {}} />
          <StatCard value="3" label="Plans brewing" emoji="🗓️" color="pink" onPress={() => {}} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatCard value="2" label="Owe a reply" emoji="⏳" color="yellow" onPress={() => {}} />
          <StatCard value="1" label="Birthday" emoji="🎂" color="lilac" onPress={() => {}} />
        </View>
      </View>
      <SectionTitle title="Plans" action="See all" />
      <ListSection>
        {plans.map((p) => (
          <ListRow key={p.title} title={p.title} subtitle={p.when} leading={<EmojiAvatar emoji={p.emoji} color={p.color} size={40} />} trailing={<AvatarStack people={p.people.map((name) => ({ name }))} size={26} overlap={0.35} />} onPress={() => {}} />
        ))}
      </ListSection>
      <View style={{ gap: space.md }}>
        <BigButton title="Catch me up" emoji="✨" onPress={() => {}} />
        <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          Read from your chats on this phone. Nothing leaves it.
        </Txt>
      </View>
    </Screen>
  );
}
