import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { EmojiAvatar, fonts, Icon, ListRow, ListSection, PillButton, radii, space, sym, Txt, useDesign } from '@/design';
import { personLine, usePeople } from '@/api/people';
import type { Person } from '@/api/client';
import { AskAvatar } from './AskAvatar';

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 46, paddingHorizontal: space.lg, borderRadius: radii.pill, backgroundColor: c.input, borderWidth: 0.5, borderColor: c.edge }}>
        <Icon name={sym('magnifyingglass', 'search')} size={16} color={c.placeholder} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search friends"
          placeholderTextColor={c.placeholder}
          aria-label="Search friends"
          style={[{ flex: 1, height: 46, color: c.text, fontFamily: fonts.ui, fontSize: 16 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
        />
      </View>
      <ListSection inset={64}>
        <ListRow title="All your chats" subtitle="Ask across every conversation" leading={<AskAvatar size={36} />} trailing={tick(current === null)} onPress={() => onPick(null)} chevron={false} />
      </ListSection>
      {people.status === 'loading' ? (
        <Txt variant="subhead" tone="secondary">
          Loading friends…
        </Txt>
      ) : null}
      {people.status === 'error' ? (
        <View style={{ gap: space.sm, alignItems: 'flex-start' }}>
          <Txt variant="subhead">Couldn’t load your friends. {people.message}</Txt>
          <PillButton title="Try again" icon={<Icon name={sym('arrow.clockwise', 'refresh')} size={14} />} small onPress={people.retry} />
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
