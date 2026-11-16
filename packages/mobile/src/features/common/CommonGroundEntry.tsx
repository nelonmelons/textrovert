import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { API_URL } from '../../api/client';
import { fetchMatch, linkedMatchId, type Match } from '../../api/match';
import { Friend, firstName } from '../../people';
import { Rounded, Theme, Type } from '../../theme';
import { Symbol } from '../../components/Paper';

/** The line under the title: what state this friend's comparison is in, or what it takes to start one. */
function summary(first: string, match: Match | null): string {
  if (!match) return `Only if ${first} uses Textrovert too and you both agree`;
  const them = match.them?.name || first;
  switch (match.status) {
    case 'waiting':
      return `Invite ${match.code} · waiting for ${first} to join`;
    case 'analyzing':
    case 'comparing':
      return `You and ${them} joined · comparing…`;
    case 'failed':
      return 'Comparing stopped · tap to try again';
    case 'ready': {
      const items = match.result?.items ?? [];
      const hidden = items.filter((i) => i.hidden).length;
      return items.length ? `${items.length} in common${hidden ? ` · ${hidden} you haven’t talked about` : ''}` : 'Nothing in common turned up yet';
    }
  }
}

/** Friend profile card that opens /common/[friend]. Only for live friends: it needs an account and the server. */
export function CommonGroundEntry({ friend }: { friend: Friend }) {
  const first = firstName(friend);
  const [match, setMatch] = useState<Match | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const id = API_URL ? await linkedMatchId(friend.id) : null;
        const next = id ? await fetchMatch(id).catch(() => null) : null;
        if (live) setMatch(next);
      })();
      return () => {
        live = false;
      };
    }, [friend.id]),
  );

  const line = summary(first, match);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/common/[friend]', params: { friend: friend.id } })}
      accessibilityRole="button"
      accessibilityLabel={`What you and ${first} have in common. ${line}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.icon}>
        <Symbol name="person.2.fill" size={18} color={Theme.repliesTone.ink} weight="bold" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[Type.headline, { fontFamily: Rounded.bold, color: Theme.ink }]}>What you and {first} have in common</Text>
        <Text style={[Type.subheadline, { color: Theme.secondary }]}>{line}</Text>
      </View>
      <Symbol name="chevron.right" size={12} color={Theme.secondary} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Theme.panel,
    borderWidth: 1.5,
    borderColor: Theme.repliesTone.fill,
  },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.repliesTone.fill },
});
