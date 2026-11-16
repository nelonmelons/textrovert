import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { fetchPortraitJson } from '../api/friend';
import { useDataMode } from '../api/mode';
import { PortraitWebView } from '../components/PortraitWebView';
import { haptics } from '../lib/haptics';
import { Theme, Type } from '../theme';

const NIGHT = '#0b0810';

/** The orbit, rivers and atlas portrait of everyone you text. Tapping a person opens their profile. */
export default function Portrait() {
  const { live } = useDataMode();
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!live) return;
    let current = true;
    setError(undefined);
    fetchPortraitJson().then(
      (text) => current && setJson(text),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [live, attempt]);

  return (
    <View style={{ flex: 1, backgroundColor: NIGHT }}>
      <Stack.Screen options={{ headerTitle: 'Your portrait', headerStyle: { backgroundColor: NIGHT }, headerTintColor: '#FFFFFF', headerTitleStyle: { color: '#FFFFFF', fontWeight: '600' } }} />
      {!live ? (
        <Message text="Your portrait is drawn from your own chats. Turn off demo data in Settings, with an API set up, to see it." />
      ) : error ? (
        <Message text={'Couldn’t load your portrait. ' + error} action={{ label: 'Try again', onPress: () => setAttempt((a) => a + 1) }} />
      ) : (
        <>
          <PortraitWebView
            portraitJson={json}
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
        </>
      )}
    </View>
  );
}

function Message({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Text style={[Type.body, { color: 'rgba(255,255,255,0.8)', textAlign: 'center' }]}>{text}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10}>
          <Text style={[Type.body, { color: Theme.accentTone.fill, fontWeight: '600' }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
