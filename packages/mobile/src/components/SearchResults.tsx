import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useNotes } from '../store';
import { useFriends } from '../api/people';
import { activityMatches, ActivityMatch, friendMatches } from '../search';
import { looksLikeQuestion } from '../chat';
import { Rounded, Theme, Type, withAlpha } from '../theme';
import { art, Divider, Face, HedgehogAvatar, SectionCard, ServiceIcon, Symbol, ToneTab } from './Paper';

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
          <Symbol name="quote.bubble" size={17} color={Theme.accent} weight="semibold" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SearchResults({ query, onBack }: { query: string; onBack: () => void }) {
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
      <Pressable onPress={onBack} accessibilityLabel="Back to Today" style={({ pressed }) => [styles.back, pressed && { opacity: 0.75 }]}>
        <Symbol name="chevron.left" size={17} color={Theme.accent} weight="semibold" />
        <Text style={[Type.body, { color: Theme.accent, fontWeight: '600' }]}>Back</Text>
      </Pressable>
      <View style={{ gap: 4 }}>
        <Text style={[Type.largeTitle, { fontFamily: Rounded.bold, color: Theme.ink }]}>Search</Text>
        <Text style={[Type.body, { color: Theme.secondary }]}>Results for “{query}”</Text>
      </View>
      <Pressable
        onPress={() => router.push({ pathname: '/chat', params: { q: query.trim() } })}
        style={({ pressed }) => [styles.ask, question && styles.askStrong, pressed && { opacity: 0.75 }]}
      >
        <HedgehogAvatar />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[Type.headline, { color: question ? '#FFFFFF' : Theme.ink }]}>Ask me</Text>
          <Text style={[Type.subheadline, { color: question ? '#FFFFFF' : Theme.secondary }]} numberOfLines={2}>
            “{query.trim()}”
          </Text>
        </View>
        <Symbol name="arrow.up.circle.fill" size={24} color={question ? '#FFFFFF' : Theme.accent} />
      </Pressable>
      {people.length === 0 && activities.length === 0 ? (
        <View style={{ gap: 12, paddingVertical: 24 }}>
          <Image source={art.bird} style={{ width: 260, height: 180, alignSelf: 'center' }} resizeMode="contain" />
          <Text style={[Type.title3, { fontFamily: Rounded.bold, color: Theme.ink }]}>No matches</Text>
          <Text style={[Type.body, { color: Theme.secondary }]}>I couldn’t find anyone for that. Try a name, a handle like @mia.c, or an activity like volleyball.</Text>
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
                  <Text style={[Type.subheadline, { color: Theme.accent }]}>{reason}</Text>
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
  ask: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: Theme.panel, borderWidth: 1.5, borderColor: withAlpha(Theme.accent, 0.5) },
  askStrong: { backgroundColor: Theme.accent, borderColor: Theme.accent },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  activityBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  quote: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(Theme.accentTone.fill, 0.6) },
  pressed: { backgroundColor: withAlpha(Theme.accentTone.fill, 0.6), opacity: 0.75, borderRadius: 12 },
});
