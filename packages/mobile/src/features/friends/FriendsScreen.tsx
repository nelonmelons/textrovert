import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Face, toneFor } from '@/components/Face';
import { FadeIn } from '@/components/FadeIn';
import { PaperScreen } from '@/components/PaperScreen';
import { setAskScope } from '@/features/ask/scope';
import { usePeople } from '@/features/ask/people';
import { formatAgo } from '@/lib/answer';
import { haptics } from '@/lib/haptics';
import type { Person } from '@/lib/api';
import { radius, shadow, type, useTheme } from '@/theme';

/** Friends: everyone you DM plus the people you talk to most in groups, searchable; a tap opens Ask about them. */
export function FriendsScreen() {
  const theme = useTheme();
  const people = usePeople();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const all = people.status === 'ready' ? people.people : [];
  const matches = all.filter((p) => !q || p.name.toLowerCase().includes(q));
  const sections = [
    { title: 'YOUR DMS', data: matches.filter((p) => p.dm) },
    { title: 'FROM YOUR GROUP CHATS', data: matches.filter((p) => !p.dm) },
  ].filter((s) => s.data.length > 0);

  const open = (p: Person) => {
    haptics.select();
    setAskScope(p);
    router.navigate('/');
  };

  return (
    <PaperScreen title="Friends" subtitle={people.status === 'ready' ? all.length + ' people you text' : undefined}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search friends"
          placeholderTextColor={theme.secondary}
          aria-label="Search friends"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[type.body, styles.search, shadow.soft, { color: theme.ink, backgroundColor: theme.panel, borderColor: theme.gridMajor }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
        />
      </View>
      {people.status === 'loading' ? <Text style={[type.subheadline, styles.note, { color: theme.secondary }]}>Loading your friends…</Text> : null}
      {people.status === 'error' ? (
        <View style={[styles.card, styles.note, shadow.soft, { backgroundColor: theme.panel }]}>
          <Text style={[type.subheadline, { color: theme.ink }]}>Couldn't load your friends. {people.message}</Text>
          <Pressable accessibilityRole="button" onPress={people.retry}>
            <Text style={[type.subheadline, { color: theme.ask.ink, fontWeight: '600' }]}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {people.status === 'ready' && matches.length === 0 ? (
        <FadeIn style={styles.none}>
          <Image source={require('../../../assets/hedgehog-bird.png')} resizeMode="contain" style={styles.bird} aria-hidden />
          <Text style={[type.title3, { color: theme.ink }]}>No one by that name</Text>
          <Text style={[type.subheadline, { color: theme.secondary, textAlign: 'center' }]}>Try a first name or a nickname from your chats.</Text>
        </FadeIn>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(p) => p.name}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => <Text style={[type.caption, styles.section, { color: theme.secondary }]}>{section.title}</Text>}
        renderItem={({ item, index, section }) => (
          <Row person={item} first={index === 0} last={index === section.data.length - 1} onPress={() => open(item)} />
        )}
      />
    </PaperScreen>
  );
}

function Row({ person: p, first, last, onPress }: { person: Person; first: boolean; last: boolean; onPress: () => void }) {
  const theme = useTheme();
  const groups = p.chats - (p.dm ? 1 : 0);
  return (
    <Pressable
      accessibilityRole="button"
      aria-label={'Ask about ' + p.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.ask.fill : theme.panel, borderColor: theme.gridMajor },
        first && styles.top,
        last ? styles.bottom : { borderBottomWidth: StyleSheet.hairlineWidth },
      ]}>
      <Face name={p.name} size={38} tone={toneFor(p.name, theme.tones)} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[type.headline, { color: theme.ink }]}>
          {p.name}
        </Text>
        <Text numberOfLines={1} style={[type.footnote, { color: theme.secondary }]}>
          {formatAgo(p.lastAt)}
          {groups > 0 ? ' · ' + groups + (groups === 1 ? ' shared group' : ' shared groups') : ''}
        </Text>
      </View>
      <View style={[styles.ask, { backgroundColor: theme.ask.fill }]}>
        <Text style={[type.footnote, { color: theme.ask.ink, fontWeight: '700' }]}>Ask</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  search: { borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  note: { marginHorizontal: 16, marginTop: 16 },
  card: { padding: 16, gap: 8, borderRadius: radius.tile },
  none: { alignItems: 'center', gap: 6, padding: 24 },
  bird: { width: 220, height: 110, marginBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  section: { fontWeight: '700', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  top: { borderTopLeftRadius: radius.tile, borderTopRightRadius: radius.tile },
  bottom: { borderBottomLeftRadius: radius.tile, borderBottomRightRadius: radius.tile },
  flex: { flex: 1 },
  ask: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.capsule },
});
