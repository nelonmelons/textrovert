import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { router } from 'expo-router';

import { PillButton, space, Txt } from '@/design';
import { fetchPortraitJson } from '../../api/friend';
import { useDataMode } from '../../api/mode';
import { PortraitWebView } from '../../components/PortraitWebView';
import { haptics } from '../../lib/haptics';

export const NIGHT = '#0b0810';

const SLEEPY = require('../../../assets/art/hedgehog-sleepy.png');
const GHOST = require('../../../assets/art/hedgehog-ghost.png');
const MAP = require('../../../assets/art/hedgehog-map.png');

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
 * as territories with the people inside. A tapped person opens their profile.
 */
export function Portrait({ view }: { view: string }) {
  const { live } = useDataMode();
  const { json, error, retry } = usePortraitJson(live);
  if (!live) return <Note art={MAP} text="Your network and topics are drawn from your own chats. Connect the app to them to see yours." />;
  if (error) return <Note art={GHOST} text={'Couldn’t load your portrait. ' + error} action={{ label: 'Try again', onPress: retry }} />;
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
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.md }}>
          <Image source={SLEEPY} resizeMode="contain" style={{ width: 150, height: 130 }} aria-hidden />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <ActivityIndicator color="#FFFFFF" />
            <Txt variant="subhead" tone="onDarkMuted" style={{ fontWeight: '500' }}>
              Drawing everyone you text…
            </Txt>
          </View>
        </View>
      )}
    </View>
  );
}

function Note({ art, text, action }: { art: number; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxxl, gap: space.lg, backgroundColor: NIGHT }}>
      <Image source={art} resizeMode="contain" style={{ width: 150, height: 130 }} aria-hidden />
      <Txt variant="callout" tone="onDarkMuted" style={{ textAlign: 'center' }}>
        {text}
      </Txt>
      {action ? <PillButton title={action.label} onPress={action.onPress} small /> : null}
    </View>
  );
}
