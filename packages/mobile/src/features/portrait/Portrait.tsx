import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchPortraitJson } from '../../api/friend';
import { useDataMode } from '../../api/mode';
import { PortraitWebView } from '../../components/PortraitWebView';
import { haptics } from '../../lib/haptics';
import { Theme, Type } from '../../theme';

export const NIGHT = '#0b0810';

/** The portrait JSON is several megabytes and only changes with new messages, so every screen shares one fetch. */
let cached: Promise<string> | null = null;

function usePortraitJson(enabled: boolean) {
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setError(undefined);
    cached ??= fetchPortraitJson();
    cached.then(
      (text) => live && setJson(text),
      (e: Error) => {
        cached = null;
        if (live) setError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, attempt]);
  return { json, error, retry: () => setAttempt((a) => a + 1) };
}

/**
 * The portrait (packages/portrait): "orbit" is the social graph with groups and edges plus replay, "atlas" the topics
 * as territories with the people inside. A tapped person opens their profile.
 */
export function Portrait({ view }: { view: string }) {
  const { live } = useDataMode();
  const { json, error, retry } = usePortraitJson(live);
  if (!live) return <Note text="Your graph and topics are drawn from your own chats. Turn off demo data in Settings, with an API set up, to see them." />;
  if (error) return <Note text={'Couldn’t load your portrait. ' + error} action={{ label: 'Try again', onPress: retry }} />;
  return (
    <View style={{ flex: 1, backgroundColor: NIGHT }}>
      <PortraitWebView
        portraitJson={json}
        view={view}
        onOpenPerson={({ name }) => {
          haptics.select();
          router.push({ pathname: '/friend/[id]', params: { id: name } });
        }}
        onHaptic={haptics.impact}
      />
      {json ? null : (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={[Type.subheadline, { color: 'rgba(255,255,255,0.7)' }]}>Drawing everyone you text…</Text>
        </View>
      )}
    </View>
  );
}

function Note({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, backgroundColor: NIGHT }}>
      <Text style={[Type.body, { color: 'rgba(255,255,255,0.8)', textAlign: 'center' }]}>{text}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10}>
          <Text style={[Type.body, { color: Theme.accentTone.fill, fontWeight: '600' }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
