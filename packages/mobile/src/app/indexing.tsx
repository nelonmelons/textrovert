import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View, type TextStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { forgetPeople } from '../api/people';
import { fetchStatus, type StageName, type UploadStatus } from '../api/upload';
import { Tactile } from '../design/Tactile';

/**
 * After onboarding uploads an export: polls GET /status every 2.5 s and shows each stage (stats and search first, then
 * Ask, moments and facts) in the onboarding's PostHog style. "Start exploring" opens the app once stats are ready;
 * the slower stages keep filling in behind it.
 */
const D = {
  canvas: '#F3F4EF',
  surface: '#FFFFFF',
  border: '#DADBD2',
  text: '#111111',
  muted: 'rgba(17, 17, 17, 0.6)',
  accent: '#F54E01',
  primaryFace: '#EB9D2A',
  primaryEdge: '#B17816',
  success: '#388600',
  danger: '#DB3707',
  radius: 6,
};
const SANS = Platform.select({ ios: undefined, android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' });
const text = (size: number, color: string, weight: TextStyle['fontWeight'] = '400'): TextStyle => ({ fontFamily: SANS, fontSize: size, lineHeight: Math.round(size * 1.35), color, fontWeight: weight });

const STAGES: { id: StageName; title: string; detail: string }[] = [
  { id: 'stats', title: 'Stats', detail: 'Who you text, when, and how fast' },
  { id: 'search', title: 'Search', detail: 'Every message, searchable' },
  { id: 'ask', title: 'Ask', detail: 'Answers with receipts' },
  { id: 'episodes', title: 'Moments', detail: 'What happened, chat by chat' },
  { id: 'facts', title: 'Facts', detail: 'Plans, gifts and details about people' },
];

export default function Indexing() {
  const insets = useSafeAreaInsets();
  const { uploadId } = useLocalSearchParams<{ uploadId?: string }>();
  const [status, setStatus] = useState<UploadStatus>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await fetchStatus(uploadId);
        if (stopped) return;
        setStatus(next);
        setError(undefined);
        const finished = next.stages.facts.state === 'ready' || next.upload?.status === 'failed';
        if (!finished) timer = setTimeout(poll, 2500);
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : 'Lost the connection. Retrying…');
        timer = setTimeout(poll, 4000);
      }
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [uploadId]);

  const failed = status?.upload?.status === 'failed';
  const statsReady = status?.stages.stats.state === 'ready';
  const askReady = status?.stages.ask.state === 'ready';
  const allReady = status?.stages.facts.state === 'ready';
  const subtitle = failed
    ? status?.upload?.error || "We couldn't read that file."
    : allReady
      ? 'Everything is ready.'
      : askReady
        ? 'Ask is ready. Moments and facts keep filling in while you look around.'
        : 'Usually 1–3 minutes. Stats come first, then Ask.';

  return (
    <View style={{ flex: 1, backgroundColor: D.canvas }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 36, paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={[text(24, D.text, '700'), { letterSpacing: -0.3 }]}>
            {failed ? 'Something went wrong' : 'Reading your chats'}
          </Text>
          <Text style={text(15, failed ? D.danger : D.muted)}>{subtitle}</Text>
        </View>

        <View style={{ backgroundColor: D.surface, borderRadius: D.radius, borderWidth: 1, borderColor: D.border, overflow: 'hidden' }}>
          {STAGES.map((stage, i) => {
            const s = status?.stages[stage.id];
            const state = failed && s?.state !== 'ready' ? 'failed' : s?.state ?? 'pending';
            return (
              <View key={stage.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: D.border }}>
                <View style={{ width: 22, alignItems: 'center' }}>
                  {state === 'running' ? (
                    <ActivityIndicator size="small" color={D.accent} />
                  ) : (
                    <Text style={text(16, state === 'ready' ? D.success : state === 'failed' ? D.danger : D.muted, '700')}>{state === 'ready' ? '✓' : state === 'failed' ? '×' : '○'}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={text(15, D.text, '600')}>{stage.title}</Text>
                  <Text style={text(13, D.muted)}>{stage.detail}</Text>
                </View>
                {s && s.total > 0 ? <Text style={text(12, D.muted, '600')}>{s.done.toLocaleString('en-US') + ' / ' + s.total.toLocaleString('en-US')}</Text> : null}
              </View>
            );
          })}
        </View>

        {error ? <Text style={text(13, D.muted)}>{error}</Text> : null}

        <Tactile
          face={D.primaryFace}
          edge={D.primaryEdge}
          radius={D.radius}
          lip={3}
          ring={1}
          haptic="thud"
          disabled={!statsReady && !failed}
          onPress={() => {
            // Anything fetched before the upload finished (the demo owner's people, or an empty list mid-indexing)
            // must not stick around now that this account has people.
            forgetPeople();
            router.replace('/');
          }}
          accessibilityLabel="Start exploring"
          faceStyle={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={text(15, D.text, '600')}>{failed ? 'Continue to Textrovert' : 'Start exploring'}</Text>
        </Tactile>
      </ScrollView>
    </View>
  );
}
