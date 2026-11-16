import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { EmojiAvatar, geist, ListRow, ListSection, PillButton, radii, space, Txt, useDesign } from '@/design';
import { personLine, usePeople } from '@/api/people';
import type { Person } from '@/api/client';
import { askHedgehog } from './hedgehog';

/** Choose who Ask is about: everyone, or one friend (their DM and the groups you share). */
export function PeoplePicker({ current, onPick }: { current: string | null; onPick: (person: Person | null) => void }) {
  const { c } = useDesign();
  const people = usePeople();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = people.status === 'ready' ? people.people.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 60) : [];
  const tick = (selected: boolean) =>
    selected ? (
      <Txt variant="headline" tone="accent" accessibilityLabel="Selected">
        ✓
      </Txt>
    ) : null;
  return (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="🔍  Search friends"
        placeholderTextColor={c.textTertiary}
        aria-label="Search friends"
        style={[{ height: 44, paddingHorizontal: space.lg, borderRadius: radii.pill, backgroundColor: c.fill, color: c.text, fontFamily: geist['400'], fontSize: 17 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
      />
      <ListSection inset={64}>
        <ListRow title="All your chats" subtitle="Ask across every conversation" leading={<EmojiAvatar {...askHedgehog} size={36} />} trailing={tick(current === null)} onPress={() => onPick(null)} chevron={false} />
      </ListSection>
      {people.status === 'loading' ? (
        <Txt variant="subhead" tone="secondary">
          Loading friends…
        </Txt>
      ) : null}
      {people.status === 'error' ? (
        <View style={{ gap: space.sm, alignItems: 'flex-start' }}>
          <Txt variant="subhead">Couldn’t load your friends. {people.message}</Txt>
          <PillButton title="Try again" emoji="🔁" kind="secondary" small onPress={people.retry} />
        </View>
      ) : null}
      {people.status === 'ready' && !matches.length ? (
        <Txt variant="subhead" tone="secondary">
          No friends match “{query.trim()}”.
        </Txt>
      ) : null}
      {people.status === 'ready' && matches.length ? (
        <ListSection header="Friends">
          {matches.map((p) => (
              <ListRow key={p.name} title={p.name} subtitle={personLine(p)} leading={<EmojiAvatar name={p.name} size={36} />} trailing={tick(current === p.name)} onPress={() => onPick(p)} chevron={false} />
            ))}
        </ListSection>
      ) : null}
    </>
  );
}
