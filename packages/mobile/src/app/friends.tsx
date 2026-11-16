import { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Friend } from '../fixtures';
import { useDataMode } from '../api/mode';
import { useFriends } from '../api/people';
import { art, Divider, Face, RowChevron, SectionCard, Symbol, ToneTab } from '../components/Paper';
import { PaperScroll } from '../components/PaperScroll';
import { haptics } from '../lib/haptics';
import { Theme, Type, withAlpha } from '../theme';

/** Everyone you text (GET /people when live, Emma's friends in demo mode), searchable; a tap opens their profile. */
export default function Friends() {
  const { live } = useDataMode();
  const { status, friends, message, retry } = useFriends();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = friends.filter((f) => !q || f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q));
  const groups = live
    ? [
        { title: 'Your DMs', symbol: 'message.fill' as const, tone: Theme.accentTone, list: matches.filter((f) => f.person?.dm) },
        { title: 'From your group chats', symbol: 'person.3.fill' as const, tone: Theme.plansTone, list: matches.filter((f) => !f.person?.dm) },
      ]
    : [{ title: 'Your people', symbol: 'person.2.fill' as const, tone: Theme.accentTone, list: matches }];

  return (
    <PaperScroll contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 18 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerTitle: 'Your people', headerTitleStyle: { color: Theme.ink, fontWeight: '600' } }} />
      <View style={styles.field}>
        <Symbol name="magnifyingglass" size={15} color={Theme.accent} weight="bold" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your people"
          placeholderTextColor={Theme.secondary}
          autoCorrect={false}
          style={[Type.body, { flex: 1, color: Theme.ink }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
        />
      </View>
      {live ? (
        <Pressable onPress={() => router.push('/portrait')} style={({ pressed }) => [styles.portrait, pressed && { opacity: 0.8 }]}>
          <Symbol name="circle.hexagongrid.fill" size={20} color="#FFFFFF" />
          <Text style={[Type.headline, { color: '#FFFFFF', flex: 1 }]}>See everyone as a portrait</Text>
          <Symbol name="chevron.right" size={13} color="#FFFFFF" weight="bold" />
        </Pressable>
      ) : null}
      {status === 'loading' ? <ActivityIndicator color={Theme.accent} /> : null}
      {status === 'error' ? (
        <SectionCard tone={Theme.coralTone}>
          <View style={{ gap: 8 }}>
            <Text style={[Type.subheadline, { color: Theme.ink }]}>Couldn’t load your people. {message}</Text>
            <Pressable onPress={retry} hitSlop={8}>
              <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Try again</Text>
            </Pressable>
          </View>
        </SectionCard>
      ) : null}
      {status === 'ready' && matches.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
          <Image source={art.bird} style={{ width: 220, height: 150 }} resizeMode="contain" />
          <Text style={[Type.title3, { color: Theme.ink, fontWeight: '700' }]}>No one by that name</Text>
          <Text style={[Type.subheadline, { color: Theme.secondary, textAlign: 'center' }]}>Try a first name or a nickname from your chats.</Text>
        </View>
      ) : null}
      {groups
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <SectionCard key={g.title} tone={g.tone}>
            <View style={{ gap: 10 }}>
              <ToneTab title={g.title} symbol={g.symbol} tone={g.tone} />
              {g.list.slice(0, 80).map((f, i) => (
                <View key={f.id} style={{ gap: 10 }}>
                  {i > 0 ? <Divider /> : null}
                  <Row friend={f} />
                </View>
              ))}
            </View>
          </SectionCard>
        ))}
    </PaperScroll>
  );
}

function Row({ friend }: { friend: Friend }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${friend.name}`}
      onPress={() => {
        haptics.select();
        router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Face initials={friend.initials} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[Type.headline, { color: Theme.ink }]}>
          {friend.name}
        </Text>
        <Text numberOfLines={1} style={[Type.footnote, { color: Theme.secondary }]}>
          {friend.handle}
        </Text>
      </View>
      <RowChevron />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1.5, borderColor: Theme.accent, backgroundColor: Theme.background },
  portrait: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#0b0810' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  pressed: { backgroundColor: withAlpha(Theme.accentTone.fill, 0.6), opacity: 0.75, borderRadius: 12 },
});
