import { useState } from 'react';

import { Avatar, EmojiAvatar, Field, Icon, ListRow, ListSection, PillButton, space, sym, Txt, useDesign } from '@/design';
import { View } from 'react-native';
import { contactName, personLine, usePeople } from '@/api/people';
import type { Person } from '@/api/client';

const mark = require('../../../assets/art/hedgehog-mark.png');

/** Choose who Ask is about: everyone, or one friend (their DM and the groups you share). */
export function PeoplePicker({ current, onPick }: { current: string | null; onPick: (person: Person | null) => void }) {
  const { c } = useDesign();
  const people = usePeople();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = people.status === 'ready' ? people.people.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 60) : [];
  const tick = (selected: boolean) =>
    selected ? (
      <Icon name="checkmark" size={16} color={c.accent} />
    ) : null;
  return (
    <>
      <Field value={query} onChangeText={setQuery} placeholder="Search friends" aria-label="Search friends" leading={<Icon name={sym('magnifyingglass', 'search')} size={16} color={c.placeholder} />} />
      <ListSection inset={64}>
        <ListRow title="All your chats" subtitle="Ask across every conversation" leading={<Avatar name="Textrovert" image={mark} size={36} />} trailing={tick(current === null)} onPress={() => onPick(null)} chevron={false} />
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
              <ListRow key={p.name} title={contactName(p.name)} subtitle={personLine(p)} leading={<EmojiAvatar name={p.name} size={36} />} trailing={tick(current === p.name)} onPress={() => onPick(p)} chevron={false} />
            ))}
        </ListSection>
      ) : null}
    </>
  );
}
