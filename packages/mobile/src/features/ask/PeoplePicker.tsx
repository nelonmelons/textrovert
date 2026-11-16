import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Face, toneFor } from '@/components/Face';
import { HedgehogAvatar } from '@/components/HedgehogAvatar';
import { formatAgo } from '@/lib/answer';
import type { Person } from '@/lib/api';
import { radius, type, useTheme } from '@/theme';
import { usePeople } from './people';

/** Choose who Ask is about: everyone, or one friend (their DM and the groups you share). */
export function PeoplePicker({ current, onPick }: { current: string | null; onPick: (person: Person | null) => void }) {
  const theme = useTheme();
  const people = usePeople();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  return (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search friends"
        placeholderTextColor={theme.secondary}
        aria-label="Search friends"
        style={[type.body, styles.search, { color: theme.ink, backgroundColor: theme.fillTertiary }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
      />
      <Row selected={current === null} onPress={() => onPick(null)} title="All your chats" detail="Ask across every conversation" leading={<HedgehogAvatar size={44} tone={theme.ask} />} />
      {people.status === 'loading' ? <Text style={[type.subheadline, { color: theme.secondary }]}>Loading friends…</Text> : null}
      {people.status === 'error' ? (
        <View style={styles.error}>
          <Text style={[type.subheadline, { color: theme.ink }]}>Couldn't load your friends. {people.message}</Text>
          <Pressable accessibilityRole="button" onPress={people.retry}>
            <Text style={[type.subheadline, { color: theme.ask.ink, fontWeight: '600' }]}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {people.status === 'ready'
        ? people.people
            .filter((p) => !q || p.name.toLowerCase().includes(q))
            .slice(0, 60)
            .map((p) => (
              <Row
                key={p.name}
                selected={current === p.name}
                onPress={() => onPick(p)}
                title={p.name}
                detail={(p.dm ? 'DM' : 'Groups only') + ' · ' + p.chats + (p.chats === 1 ? ' chat' : ' chats') + ' · ' + formatAgo(p.lastAt)}
                leading={<Face name={p.name} size={38} tone={toneFor(p.name, theme.tones)} />}
              />
            ))
        : null}
    </>
  );
}

function Row({ title, detail, leading, selected, onPress }: { title: string; detail: string; leading: React.ReactNode; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: selected ? theme.ask.fill : pressed ? theme.fillTertiary : 'transparent' }]}>
      {leading}
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[type.headline, { color: theme.ink }]}>
          {title}
        </Text>
        <Text style={[type.footnote, { color: theme.secondary }]}>{detail}</Text>
      </View>
      {selected ? <Text style={[type.headline, { color: theme.ask.ink }]}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: radius.tile, marginVertical: -6 },
  flex: { flex: 1 },
  error: { gap: 6 },
});
