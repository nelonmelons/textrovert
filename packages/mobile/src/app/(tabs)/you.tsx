import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { DesignFonts, EmojiAvatar, LargeTitle, ListRow, ListSection, Screen, SectionTitle, SegmentedControl, space, Txt } from '@/design';
import { useDataMode } from '../../api/mode';
import { HeadlineStats, RANGES, rangeTotals, StatsBreakdown, StatsLoading, useStats } from '../../features/stats/LiveStats';
import { count } from '../../features/stats/parts';
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
    <DesignFonts>
      <Screen>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.lg }}>
          <EmojiAvatar image={require('../../../assets/art/hedgehog-chart.png')} color="lilac" size={96} name="You" />
          <LargeTitle center title={TITLES[range]} subtitle={subtitle} />
        </View>
        <SegmentedControl segments={[...RANGES]} value={range} onChange={setRange} />
        {!live ? (
          <ListSection>
            <Txt variant="callout" style={{ padding: space.lg }}>
              Live stats come from your own chats. With demo data on, import the file from your Mac below to see yours.
            </Txt>
          </ListSection>
        ) : ready ? (
          <HeadlineStats stats={ready} range={range} />
        ) : (
          <StatsLoading state={state} retry={retry} />
        )}
        <SectionTitle title="What you talk about" />
        <TopicTiles live={live} />
        {ready ? <StatsBreakdown stats={ready} /> : null}
        <ListSection header="From your Mac">
          <ListRow title="Your iMessage stats" subtitle="Import the file Textrovert on your Mac saves" leading={<EmojiAvatar emoji="💻" color="blue" size={36} />} onPress={() => router.push('/stats')} />
        </ListSection>
        <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          Counted from your own chats.
        </Txt>
      </Screen>
    </DesignFonts>
  );
}
