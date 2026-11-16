import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { API_URL } from '../../api/client';
import { fetchMatch, linkedMatchId, type Match } from '../../api/match';
import { Friend, firstName } from '../../people';
import { haptics } from '../../lib/haptics';
import { Chevron, Glass, PressScale, Txt, space } from '@/design';

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

/** Friend profile row that opens /common/[friend], in the same house glass as the Wrapped row. Live friends only. */
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
    <PressScale
      accessibilityLabel={`What you and ${first} have in common. ${line}`}
      onPress={() => {
        haptics.impact('light');
        router.push({ pathname: '/common/[friend]', params: { friend: friend.id } });
      }}
    >
      <Glass tone="dark" radius={24} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="title2">You & {first} in common</Txt>
          <Txt variant="footnote" tone="secondary">
            {line}
          </Txt>
        </View>
        <Chevron />
      </Glass>
    </PressScale>
  );
}
