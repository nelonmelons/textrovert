import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useDataMode } from '../../api/mode';
import { RowChevron, SectionCard, ToneTab } from '../../components/Paper';
import { PaperScroll } from '../../components/PaperScroll';
import { Segmented } from '../../components/Segmented';
import { TabHeader } from '../../components/TabHeader';
import { LiveStats, StatsLoading, useStats } from '../../features/stats/LiveStats';
import { Portrait } from '../../features/portrait/Portrait';
import { Theme, Type } from '../../theme';

type Mode = 'stats' | 'topics';

/** You: your texting stats (GET /stats, Kevin's file import as a second source) and your topics as the atlas. */
export default function You() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'topics' ? 'topics' : 'stats');
  const { live } = useDataMode();
  const { state, retry } = useStats(live && mode === 'stats');
  const topics = mode === 'topics';
  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="You" dark={topics}>
        <Segmented
          dark={topics}
          value={mode}
          onChange={setMode}
          options={[
            { id: 'stats', label: 'Stats' },
            { id: 'topics', label: 'Topics' },
          ]}
        />
      </TabHeader>
      {topics ? (
        <Portrait view="atlas" />
      ) : (
        <PaperScroll contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }}>
          {!live ? (
            <SectionCard tone={Theme.celebrateTone}>
              <Text style={[Type.subheadline, { color: Theme.ink }]}>Live stats come from your own chats. With demo data on, import the file from your Mac below to see yours.</Text>
            </SectionCard>
          ) : state.status === 'ready' ? (
            <LiveStats stats={state.stats} />
          ) : (
            <StatsLoading state={state} retry={retry} />
          )}
          <Pressable onPress={() => router.push('/stats')} style={({ pressed }) => pressed && { opacity: 0.8 }}>
            <SectionCard tone={Theme.repliesTone} fillOpacity={0.35}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1, gap: 8 }}>
                  <ToneTab title="Your iMessage stats" symbol="square.and.arrow.down" tone={Theme.repliesTone} />
                  <Text style={[Type.subheadline, { color: Theme.ink }]}>Import the file Textrovert on your Mac saves to count your whole iMessage history on this phone.</Text>
                </View>
                <RowChevron />
              </View>
            </SectionCard>
          </Pressable>
        </PaperScroll>
      )}
    </View>
  );
}
