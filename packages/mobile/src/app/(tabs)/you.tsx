import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Eyebrow, Glass, IconButton, LargeTitle, ListRow, ListSection, Screen, SectionTitle, SegmentedControl, space, sym, TAB_BAR_SPACE, Txt } from '@/design';
import { useDataMode } from '../../api/mode';
import { HeadlineStats, RANGES, rangeTotals, StatsBreakdown, StatsLoading, useStats } from '../../features/stats/LiveStats';
import { count, GlassBadge } from '../../features/stats/parts';
import { TopicTiles } from '../../features/stats/Topics';

const TITLES = ['Your month in texts', 'Your year in texts', 'All your texts'];

/** You: your texting stats (GET /stats, Kevin's file import as a second source) and your topics, which open the atlas. */
export default function You() {
  const [range, setRange] = useState(1);
  const { live } = useDataMode();
  const { state, retry } = useStats(live);
  const ready = state.status === 'ready' ? state.stats : null;
  let subtitle = 'Your texting, counted from your own chats.';
  if (ready) {
    const { sent, received, since } = rangeTotals(ready, range);
    const when = !since ? '' : range === 0 ? ' in ' + since.toLocaleDateString('en-US', { month: 'long' }) : ' since ' + since.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    subtitle = count(sent + received) + ' messages back and forth' + when + '.';
  }
  return (
    <Screen scene="twilight" bottomInset={TAB_BAR_SPACE}>
      <View style={{ gap: space.lg, paddingTop: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow text="Your texting" />
          <IconButton icon={sym('gearshape.fill', 'settings')} label="Settings" size={40} onPress={() => router.push('/settings')} />
        </View>
        <LargeTitle size="display" title={TITLES[range]} subtitle={subtitle} />
      </View>
      <SegmentedControl segments={[...RANGES]} value={range} onChange={setRange} />
      {!live ? (
        <Glass tone="dark" radius={24} style={{ padding: space.lg }}>
          <Txt variant="callout">Live stats come from your own chats. With demo data on, import the file from your Mac below to see yours.</Txt>
        </Glass>
      ) : ready ? (
        <HeadlineStats stats={ready} range={range} />
      ) : (
        <StatsLoading state={state} retry={retry} />
      )}
      <SectionTitle title="What you talk about" />
      <TopicTiles live={live} />
      {ready ? <StatsBreakdown stats={ready} /> : null}
      <ListSection header="From your Mac">
        <ListRow title="Your iMessage stats" subtitle="Import the file Textrovert on your Mac saves" leading={<GlassBadge emoji="💻" />} onPress={() => router.push('/stats')} />
      </ListSection>
      <Txt variant="footnote" tone="tertiary" shadow style={{ textAlign: 'center' }}>
        Counted from your own chats.
      </Txt>
    </Screen>
  );
}
