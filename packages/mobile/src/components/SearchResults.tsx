import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useNotes } from '../store';
import { useFriends } from '../api/people';
import { activityMatches, ActivityMatch, friendMatches } from '../search';
import { looksLikeQuestion } from '../chat';
import { Rounded, Theme, titleShadow, Type, withAlpha } from '../theme';
import { Divider, Face, HedgehogAvatar, HedgehogMark, SectionCard, ServiceIcon, Symbol, ToneTab } from './Paper';

const openProfile = (id: string) => router.push({ pathname: '/friend/[id]', params: { id } });

function ActivityRow({ match }: { match: ActivityMatch }) {
  const source = match.friend.messages.find((m) => m.id === match.item.sourceID);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
      <Pressable onPress={() => openProfile(match.friend.id)} style={({ pressed }) => [styles.activityBody, pressed && styles.pressed]}>
        <Face initials={match.friend.initials} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[Type.headline, { color: Theme.ink }]}>{match.friend.name}</Text>
          {match.item.detail ? <Text style={[Type.subheadline, { color: Theme.ink }]}>{match.item.detail}</Text> : null}
          <Text style={[Type.caption, { fontWeight: '600', color: match.exact ? Theme.activitiesTone.ink : Theme.secondary }]}>
            {match.exact ? `Mentions ${match.item.title.toLowerCase()}` : `Related to ${match.term}`}
          </Text>
          {source ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ServiceIcon service={source.service} />
              <Text style={[Type.caption, { color: Theme.secondary }]}>{source.date}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Symbol name="person.crop.circle" size={11} color={Theme.secondary} />
              <Text style={[Type.caption, { color: Theme.secondary }]}>Added by you</Text>
            </View>
          )}
        </View>
        <Symbol name="chevron.right" size={12} color={Theme.secondary} weight="semibold" />
      </Pressable>
      {source ? (
        <Pressable
          onPress={() => router.push({ pathname: '/source', params: { friend: match.friend.id, message: source.id, profile: '1' } })}
          accessibilityLabel={`See ${match.friend.name.split(' ')[0]}’s message about ${match.item.title.toLowerCase()}`}
          style={styles.quote}
        >
          <Symbol name="quote.bubble" size={17} color="#FFFFFF" weight="semibold" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SearchResults({ query }: { query: string }) {
  const { items } = useNotes();
  const { friends } = useFriends();
  const people = friendMatches(query, friends).slice(0, 20);
  const question = looksLikeQuestion(query);
  const activities = activityMatches(query, (friend) => items(friend, 'together'), friends);
  const groups = Object.entries(
    activities.reduce<Record<string, ActivityMatch[]>>((acc, match) => {
      const key = match.item.title.toLowerCase();
      (acc[key] ??= []).push(match);
      return acc;
    }, {}),
  ).sort(([lk, lv], [rk, rv]) => {
    const l = lv.some((m) => m.exact);
    const r = rv.some((m) => m.exact);
    return l !== r ? (l ? -1 : 1) : lk.localeCompare(rk);
  });

  return (
    <View style={{ gap: 20 }}>
      <Text style={[Type.subheadline, { color: Theme.secondary }]}>Results for “{query.trim()}”</Text>
      <Pressable
        onPress={() => router.push({ pathname: '/chat', params: { q: query.trim() } })}
        style={({ pressed }) => [styles.ask, question && styles.askStrong, pressed && { opacity: 0.75 }]}
      >
        <HedgehogAvatar />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[Type.headline, { color: question ? '#081721' : Theme.ink }]}>Ask me</Text>
          <Text style={[Type.subheadline, { color: question ? 'rgba(8, 23, 33, 0.7)' : Theme.secondary }]} numberOfLines={2}>
            “{query.trim()}”
          </Text>
        </View>
        <Symbol name="arrow.up.circle.fill" size={24} color={question ? '#081721' : '#FFFFFF'} />
      </Pressable>
      {people.length === 0 && activities.length === 0 ? (
        <View style={{ gap: 12, paddingVertical: 24 }}>
          <HedgehogMark height={36} />
          <Text style={[Type.title2, titleShadow, { fontFamily: Rounded.bold, color: Theme.ink }]}>No matches</Text>
          <Text style={[Type.body, { color: Theme.secondary }]}>I couldn’t find anyone for that. Try a name, a handle, or something you do together.</Text>
        </View>
      ) : null}
      {groups.map(([key, matches]) => {
        const exact = matches.some((m) => m.exact);
        return (
          <SectionCard key={key} tone={Theme.activitiesTone}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <ToneTab title={matches[0].item.title} symbol="figure.2" tone={Theme.activitiesTone} style={{ alignSelf: 'center' }} />
                <Text style={[Type.caption, { color: Theme.secondary, fontWeight: '600' }]}>{exact ? 'Activity' : 'Related interest'}</Text>
              </View>
              {matches.map((match, index) => (
                <View key={`${match.friend.id}-${match.item.id}`} style={{ gap: 12 }}>
                  {index > 0 ? <Divider /> : null}
                  <ActivityRow match={match} />
                </View>
              ))}
            </View>
          </SectionCard>
        );
      })}
      {people.length > 0 ? (
        <SectionCard tone={Theme.accentTone}>
          <View style={{ gap: 10 }}>
            <ToneTab title="People" symbol="person.2.fill" tone={Theme.accentTone} />
            {people.map(({ friend, reason }) => (
              <Pressable key={friend.id} onPress={() => openProfile(friend.id)} style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
                <Face initials={friend.initials} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[Type.headline, { color: Theme.ink }]}>{friend.name}</Text>
                  <Text style={[Type.subheadline, { color: Theme.secondary }]}>{friend.handle}</Text>
                  <Text style={[Type.subheadline, { color: Theme.accentTone.ink }]}>{reason}</Text>
                </View>
                <Symbol name="chevron.right" size={12} color={Theme.secondary} weight="semibold" />
              </Pressable>
            ))}
          </View>
        </SectionCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ask: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.3)' },
  askStrong: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  activityBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  quote: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(Theme.accentTone.fill, 0.6) },
  pressed: { backgroundColor: withAlpha(Theme.accentTone.fill, 0.6), opacity: 0.75, borderRadius: 12 },
});
