import { useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { AvatarStack, Chip, DarkCard, EmojiAvatar, LargeTitle, ListRow, ListSection, PillButton, PressScale, SegmentedControl, space, Txt, useDesign } from '@/design';
import { Friend } from '../../people';
import { useFriends } from '../../api/people';
import { haptics } from '../../lib/haptics';
import { compact } from '../stats/parts';

const DETECTIVE = require('../../../assets/art/hedgehog-detective.png');
const GHOST = require('../../../assets/art/hedgehog-ghost.png');

const SEGMENTS = ['Close', 'Groups', 'Everyone'];
const CLOSE = 25;
const SHOWN = 80;
const DAY = 86_400_000;

const lastAt = (f: Friend) => (f.person ? new Date(f.person.lastAt).getTime() : 0);
const messages = (f: Friend) => f.person?.messages ?? 0;

/** "Last message 2h ago · 3,983 messages": when you two last texted and how much, from GET /people. */
function lastMessage(f: Friend, now = Date.now()) {
  if (!f.person) return f.handle;
  const then = lastAt(f);
  const mins = Math.max(0, Math.round((now - then) / 60_000));
  const date = new Date(then);
  const when =
    mins < 60
      ? mins + 'm ago'
      : mins < 24 * 60
        ? Math.round(mins / 60) + 'h ago'
        : now - then < 7 * DAY
          ? date.toLocaleDateString('en-US', { weekday: 'long' })
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : null) });
  return 'Last message ' + when + ' · ' + compact(messages(f)) + ' messages';
}

const FILTERS = [
  { label: 'All', emoji: undefined, test: () => true },
  { label: 'This week', emoji: '⚡️', test: (f: Friend) => Date.now() - lastAt(f) < 7 * DAY },
  { label: 'Quiet lately', emoji: '💤', test: (f: Friend) => Date.now() - lastAt(f) > 60 * DAY },
];

const openFriend = (friend: Friend) => {
  haptics.select();
  router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
};

/** People: everyone you text (GET /people), as close friends, group-chat people or everyone; a tap opens their profile. */
export function PeopleList() {
  const { c } = useDesign();
  const { status, friends, message, retry } = useFriends();
  const [segment, setSegment] = useState(0);
  const [filter, setFilter] = useState(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const byMessages = [...friends].sort((a, b) => messages(b) - messages(a));
  const lists = [byMessages.filter((f) => f.person?.dm).slice(0, CLOSE), byMessages.filter((f) => !f.person?.dm), [...friends].sort((a, b) => lastAt(b) - lastAt(a))];
  const base = q ? friends.filter((f) => f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q)) : lists[segment];
  const shown = base.filter(FILTERS[filter].test);
  const header = q ? 'Matches' : ['Close friends', 'From your group chats', 'Everyone'][segment];
  const footer = q ? undefined : ['Your most-messaged DMs.', 'People you only text in group chats, most-messaged first.', 'Everyone you text, most recent first.'][segment];

  return (
    <>
      <LargeTitle
        title="People"
        subtitle="Everyone you actually talk to."
        trailing={
          <PressScale
            accessibilityLabel={searching ? 'Close search' : 'Search your people'}
            onPress={() => {
              if (searching) setQuery('');
              setSearching((s) => !s);
            }}>
            <EmojiAvatar emoji={searching ? '✖️' : '🔍'} color="white" size={44} />
          </PressScale>
        }
      />
      {searching ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 44, paddingHorizontal: space.md, borderRadius: 12, borderCurve: 'continuous', backgroundColor: c.fill }}>
          <Txt style={{ fontSize: 15 }}>🔍</Txt>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search your people"
            placeholderTextColor={c.textTertiary}
            autoCorrect={false}
            style={[{ flex: 1, fontSize: 17, color: c.text, fontFamily: 'Geist_400Regular' }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          />
        </View>
      ) : null}
      {q ? null : <SegmentedControl segments={SEGMENTS} value={segment} onChange={setSegment} />}
      {q ? null : <GraphCard friends={byMessages} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.sm }}>
        {FILTERS.map((f, i) => (
          <Chip key={f.label} label={f.label} emoji={f.emoji} count={base.filter(f.test).length} selected={i === filter} onPress={() => setFilter(i)} />
        ))}
      </ScrollView>
      {status === 'loading' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: 20, borderCurve: 'continuous', backgroundColor: c.grouped }}>
          <ActivityIndicator color={c.accent} />
          <Txt variant="callout" tone="secondary">
            Finding everyone you text…
          </Txt>
        </View>
      ) : null}
      {status === 'error' ? (
        <ListSection>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}>
            <Image source={GHOST} resizeMode="contain" style={{ width: 64, height: 64 }} aria-hidden />
            <View style={{ flex: 1, gap: space.sm, alignItems: 'flex-start' }}>
              <Txt variant="callout">Couldn’t load your people. {message}</Txt>
              <PillButton title="Try again" onPress={retry} small />
            </View>
          </View>
        </ListSection>
      ) : null}
      {status === 'ready' && shown.length === 0 ? (
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
          <Image source={DETECTIVE} resizeMode="contain" style={{ width: 160, height: 140 }} aria-hidden />
          <Txt variant="title3">{q ? 'No one by that name' : 'No one here yet'}</Txt>
          <Txt variant="subhead" tone="secondary" style={{ textAlign: 'center' }}>
            {q ? 'Try a first name or a nickname from your chats.' : friends.length ? 'Try another filter.' : 'Everyone you text shows up here once your chats are connected.'}
          </Txt>
        </View>
      ) : null}
      {shown.length > 0 ? (
        <ListSection header={header} footer={footer}>
          {shown.slice(0, SHOWN).map((f) => (
            <ListRow key={f.id} title={f.name} subtitle={lastMessage(f)} accessibilityLabel={`Open ${f.name}`} leading={<EmojiAvatar name={f.name} size={44} />} onPress={() => openFriend(f)} />
          ))}
        </ListSection>
      ) : null}
    </>
  );
}

/** The dark "Your social graph" card: your most-messaged people, opening the network (the portrait's orbit). */
function GraphCard({ friends }: { friends: Friend[] }) {
  return (
    <PressScale
      accessibilityLabel="Open your social graph"
      onPress={() => {
        haptics.select();
        router.push({ pathname: '/portrait', params: { view: 'orbit' } });
      }}>
      <DarkCard style={{ padding: space.xl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          <AvatarStack people={friends.slice(0, 6).map((f) => ({ name: f.name }))} size={40} max={5} />
          <Txt variant="title3" tone="onDark">
            →
          </Txt>
        </View>
        <View style={{ gap: 2 }}>
          <Txt variant="title2" tone="onDark">
            Your social graph 🕸️
          </Txt>
          <Txt variant="subhead" tone="onDarkMuted">
            See who connects your friend groups.
          </Txt>
        </View>
      </DarkCard>
    </PressScale>
  );
}
