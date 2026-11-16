import { ReactNode, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Face, HedgehogAvatar, Symbol } from '@/components/Paper';
import { initials, personLine, usePeople } from '@/api/people';
import type { Person } from '@/api/client';
import { radius, Theme, Type } from '@/theme';

/** Choose who Ask is about: everyone, or one friend (their DM and the groups you share). */
export function PeoplePicker({ current, onPick }: { current: string | null; onPick: (person: Person | null) => void }) {
  const people = usePeople();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  return (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search friends"
        placeholderTextColor={Theme.secondary}
        aria-label="Search friends"
        style={[Type.body, styles.search, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
      />
      <Row selected={current === null} onPress={() => onPick(null)} title="All your chats" detail="Ask across every conversation" leading={<HedgehogAvatar />} />
      {people.status === 'loading' ? <Text style={[Type.subheadline, { color: Theme.secondary }]}>Loading friends…</Text> : null}
      {people.status === 'error' ? (
        <View style={{ gap: 6 }}>
          <Text style={[Type.subheadline, { color: Theme.ink }]}>Couldn’t load your friends. {people.message}</Text>
          <Pressable accessibilityRole="button" onPress={people.retry}>
            <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {people.status === 'ready'
        ? people.people
            .filter((p) => !q || p.name.toLowerCase().includes(q))
            .slice(0, 60)
            .map((p) => <Row key={p.name} selected={current === p.name} onPress={() => onPick(p)} title={p.name} detail={personLine(p)} leading={<Face initials={initials(p.name)} />} />)
        : null}
    </>
  );
}

function Row({ title, detail, leading, selected, onPress }: { title: string; detail: string; leading: ReactNode; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: selected ? Theme.accentTone.fill : pressed ? Theme.tertiaryFill : 'transparent' }]}
    >
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[Type.headline, { color: Theme.ink }]}>
          {title}
        </Text>
        <Text style={[Type.footnote, { color: Theme.secondary }]}>{detail}</Text>
      </View>
      {selected ? <Symbol name="checkmark" size={15} color={Theme.accent} weight="bold" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 10, color: Theme.ink, backgroundColor: Theme.tertiaryFill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: radius.tile, marginVertical: -6 },
});
