import { Fragment, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchStatus, type StageName, type UploadStatus } from '../api/upload';
import { Backdrop, BigButton, Glass, Icon, LargeTitle, Txt, Wordmark } from '@/design';

/**
 * After onboarding uploads an export: polls GET /status every 2.5 s and shows each stage (stats and search first, then
 * Ask, moments and facts) in the onboarding's design: the painted sky, a heavy white title, the stages as rows of the
 * liquid rounded glass, and the white key. "Start exploring" opens the app once stats are ready; the slower stages keep
 * filling in behind it.
 */
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
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Backdrop scene="clouds" scrim={0.12} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 20 }}>
        <Wordmark size={22} />
        <View style={{ paddingTop: 12, paddingHorizontal: 4 }}>
          <LargeTitle title={failed ? 'Something went wrong' : 'Reading your chats'} subtitle={subtitle} />
        </View>

        <Glass tone="dark" radius={24} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          {STAGES.map((stage, i) => {
            const s = status?.stages[stage.id];
            const state = failed && s?.state !== 'ready' ? 'failed' : s?.state ?? 'pending';
            return (
              <Fragment key={stage.id}>
                {i ? <View style={{ height: 0.5, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginHorizontal: 12 }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 }}>
                  <View style={{ width: 24, alignItems: 'center' }}>
                    {state === 'running' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : state === 'ready' ? (
                      <Icon name="checkmark.circle.fill" size={18} color="#FFFFFF" />
                    ) : state === 'failed' ? (
                      <Icon name="xmark" size={14} color="#FFB4B4" />
                    ) : (
                      <Icon name="circle.dashed" size={16} color="rgba(255, 255, 255, 0.5)" />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Txt variant="body" style={{ fontWeight: '700' }}>
                      {stage.title}
                    </Txt>
                    <Txt variant="footnote" tone="secondary">
                      {stage.detail}
                    </Txt>
                  </View>
                  {s && s.total > 0 ? (
                    <Txt variant="footnote" tone="secondary" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                      {s.done.toLocaleString('en-US') + ' / ' + s.total.toLocaleString('en-US')}
                    </Txt>
                  ) : null}
                </View>
              </Fragment>
            );
          })}
        </Glass>

        {error ? (
          <Txt variant="footnote" tone="secondary" shadow>
            {error}
          </Txt>
        ) : null}

        <BigButton title={failed ? 'Continue to Textrovert' : 'Start exploring'} disabled={!statsReady && !failed} onPress={() => router.replace('/')} />
      </ScrollView>
    </View>
  );
}
