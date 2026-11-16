import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Friend } from '../../people';
import { useDataMode } from '../../api/mode';
import { useFriends } from '../../api/people';
import { haptics } from '../../lib/haptics';
import { EmojiAvatar, Eyebrow, Glass, Icon, PillButton, PressScale, space, TAB_BAR_SPACE, Txt, useDesign } from '@/design';

/** Everyone you text (GET /people when live, Emma's friends in demo mode), searchable; a tap opens their profile. */
export function PeopleList() {
  const { live } = useDataMode();
  const insets = useSafeAreaInsets();
  const { status, friends, message, retry } = useFriends();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = friends.filter((f) => !q || f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q));
  const groups = live
    ? [
        { title: 'Your DMs', list: matches.filter((f) => f.person?.dm) },
        { title: 'From your group chats', list: matches.filter((f) => !f.person?.dm) },
      ]
    : [{ title: 'Your people', list: matches }];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.xs, paddingBottom: TAB_BAR_SPACE + insets.bottom + space.xl, gap: space.xl }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <SearchField value={query} onChange={setQuery} />
      {status === 'loading' ? <ActivityIndicator color="#FFFFFF" style={{ paddingVertical: space.xl }} /> : null}
      {status === 'error' ? (
        <Glass tone="dark" style={{ padding: space.lg, gap: space.md }}>
          <Txt variant="callout">Couldn’t load your people. {message}</Txt>
          <PillButton title="Try again" kind="primary" small onPress={retry} />
        </Glass>
      ) : null}
      {status === 'ready' && matches.length === 0 ? <Empty searching={!!q} /> : null}
      {groups
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <View key={g.title} style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.xs }}>
              <Eyebrow text={g.title} />
              <Txt variant="footnote" tone="tertiary" shadow>
                {g.list.length}
              </Txt>
            </View>
            <Glass tone="dark" radius={24}>
              {g.list.slice(0, 80).map((f, i) => (
                <View key={f.id}>
                  {i > 0 ? <View style={{ height: 0.5, marginLeft: 72, backgroundColor: 'rgba(255, 255, 255, 0.12)' }} /> : null}
                  <Row friend={f} />
                </View>
              ))}
            </Glass>
          </View>
        ))}
    </ScrollView>
  );
}

/** Ditto's input: a navy pill (Nu-6 at 72%) with white text and a grey placeholder. */
function SearchField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const { c } = useDesign();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingLeft: space.lg, paddingRight: space.md, borderRadius: 999, backgroundColor: c.input, borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.16)' }}>
      <Icon name="magnifyingglass" size={16} color={c.placeholder} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search your people"
        placeholderTextColor={c.placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={[{ flex: 1, height: 48, color: '#FFFFFF', fontSize: 16 }, Platform.OS === 'web' ? ({ outlineStyle: 'none', fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' } as object) : { fontFamily: 'Arial' }]}
      />
      {value ? (
        <PressScale onPress={() => onChange('')} accessibilityLabel="Clear search">
          <Icon name="xmark.circle.fill" size={16} color={c.placeholder} />
        </PressScale>
      ) : null}
    </View>
  );
}

function Empty({ searching }: { searching: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.huge, paddingHorizontal: space.xl }}>
      <Txt variant="title2" style={{ textAlign: 'center' }}>
        {searching ? 'No one by that name' : 'No one here yet'}
      </Txt>
      <Txt variant="callout" tone="secondary" shadow style={{ textAlign: 'center' }}>
        {searching ? 'Try a first name or a nickname from your chats.' : 'Everyone you text shows up here once your messages are synced.'}
      </Txt>
    </View>
  );
}

function Row({ friend }: { friend: Friend }) {
  return (
    <PressScale
      scale={0.985}
      accessibilityLabel={`Open ${friend.name}`}
      onPress={() => {
        haptics.select();
        router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 68 }}
    >
      <EmojiAvatar name={friend.name} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" numberOfLines={1} style={{ fontWeight: '700' }}>
          {friend.name}
        </Txt>
        <Txt variant="footnote" tone="secondary" numberOfLines={1}>
          {friend.handle}
        </Txt>
      </View>
      <Icon name="chevron.right" size={13} color="rgba(255, 255, 255, 0.45)" />
    </PressScale>
  );
}
