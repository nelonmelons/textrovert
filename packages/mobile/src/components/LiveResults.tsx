import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useNotes } from '../store';
import { useFriends } from '../api/people';
import { activityMatches, friendMatches } from '../search';
import { looksLikeQuestion } from '../chat';
import { firstName } from '../people';
import { Theme, Type } from '../theme';
import { Face, HedgehogAvatar, Symbol } from './Paper';

function Row({ onPress, icon, title, subtitle, label }: { onPress: () => void; icon: React.ReactNode; title: string; subtitle?: string; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[Type.body, { color: Theme.ink, fontWeight: '600' }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[Type.subheadline, { color: Theme.secondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const Circle = ({ children }: { children: React.ReactNode }) => <View style={styles.circle}>{children}</View>;

export function LiveResults({ query, onSearch }: { query: string; onSearch: () => void }) {
  const { items } = useNotes();
  const { friends } = useFriends();
  const text = query.trim();
  if (!text) {
    return <Text style={[Type.subheadline, styles.hint]}>Search people, handles or things you do together, or ask me a question.</Text>;
  }
  const people = friendMatches(text, friends).slice(0, 20);
  const activities = activityMatches(text, (friend) => items(friend, 'together'), friends);
  const ask = (
    <Row
      key="ask"
      onPress={() => router.push({ pathname: '/chat', params: { q: text } })}
      icon={<HedgehogAvatar />}
      title={`Ask me “${text}”`}
      label={`Ask me ${text}`}
    />
  );
  const search = (
    <Row
      key="search"
      onPress={onSearch}
      icon={
        <Circle>
          <Symbol name="magnifyingglass" size={15} color={Theme.ink} weight="semibold" />
        </Circle>
      }
      title={`Search for “${text}”`}
      label={`Search for ${text}`}
    />
  );
  return (
    <View>
      {looksLikeQuestion(text) ? [ask, search] : [search, ask]}
      {people.map(({ friend }) => (
        <Row key={friend.id} onPress={() => router.push({ pathname: '/friend/[id]', params: { id: friend.id } })} icon={<Face initials={friend.initials} />} title={friend.name} subtitle={friend.handle} />
      ))}
      {activities.map(({ friend, item }) => (
        <Row
          key={`${friend.id}-${item.id}`}
          onPress={() => router.push({ pathname: '/friend/[id]', params: { id: friend.id } })}
          icon={
            <Circle>
              <Symbol name="figure.2" size={15} color={Theme.activitiesTone.ink} weight="semibold" />
            </Circle>
          }
          title={item.title}
          subtitle={`${firstName(friend)} · ${item.detail}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8 },
  pressed: { backgroundColor: Theme.tertiaryFill },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.tertiaryFill },
  hint: { color: Theme.secondary, paddingHorizontal: 16, paddingVertical: 16 },
});
