import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { fetchPortraitJson } from '../../api/friend';
import { useDataMode } from '../../api/mode';
import { PortraitWebView } from '../../components/PortraitWebView';
import { haptics } from '../../lib/haptics';
import { Glass, PillButton, space, Txt } from '@/design';

/** Ditto's navy (Nu-7): what the portrait page paints behind its overlays. The page itself is transparent. */
export const NIGHT = '#081721';

/**
 * On web the portrait screen-blends onto the photograph behind it: the orbit canvas paints its own near-black night,
 * which drops out, while its stars, people and labels light up the real sky. (Native shows the page as it paints.)
 */
const screenBlend = Platform.OS === 'web' ? ({ mixBlendMode: 'screen' } as object) : null;

/** The portrait JSON is several megabytes and only changes with new messages, so every screen shares one fetch. */
let cached: Promise<string> | null = null;

export function usePortraitJson(enabled: boolean) {
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
 * as territories with the people inside. It draws on a transparent page, so the screen's Ditto photograph shows
 * through. bottomInset keeps its own controls clear of the floating tab bar. A tapped person opens their profile.
 */
export function Portrait({ view, bottomInset = 0 }: { view: string; bottomInset?: number }) {
  const { live } = useDataMode();
  const { json, error, retry } = usePortraitJson(live);
  if (!live) return <Note text="Your graph and topics are drawn from your own chats. Turn off demo data in Settings, with an API set up, to see them." />;
  if (error) return <Note text={'Couldn’t load your portrait. ' + error} action={{ label: 'Try again', onPress: retry }} />;
  return (
    <View style={[{ flex: 1, paddingBottom: bottomInset }, screenBlend]}>
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
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: bottomInset, alignItems: 'center', justifyContent: 'center', gap: space.md }}>
          <ActivityIndicator color="#FFFFFF" />
          <Txt variant="subhead" tone="secondary" shadow>
            Drawing everyone you text…
          </Txt>
        </View>
      )}
    </View>
  );
}

function Note({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.gutter }}>
      <Glass tone="dark" style={{ padding: space.xl, gap: space.lg, alignItems: 'center' }}>
        <Txt variant="callout" style={{ textAlign: 'center' }}>
          {text}
        </Txt>
        {action ? (
          <View>
            <PillButton title={action.label} kind="primary" small onPress={action.onPress} />
          </View>
        ) : null}
      </Glass>
    </View>
  );
}
