import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchReel, reelUrl, startReel, type Reel } from '../../api/friend';
import { Symbol } from '../../components/Paper';
import { haptics } from '../../lib/haptics';
import { Theme, Type, withAlpha } from '../../theme';

const POLL_MS = 3000;

/** "Make a reel" for one episode: starts a render, polls until it is ready, then plays it inline. */
export function ReelButton({ episodeId }: { episodeId: number }) {
  const [reel, setReel] = useState<Reel>();
  const [error, setError] = useState<string>();
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  useEffect(() => {
    if (reel?.status !== 'rendering') return;
    const timer = setTimeout(() => {
      fetchReel(episodeId).then(
        (next) => live.current && setReel(next),
        (e: Error) => live.current && setError(e.message),
      );
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [reel, episodeId]);

  const make = async () => {
    haptics.impact('medium');
    setError(undefined);
    setReel({ status: 'rendering', episodeId });
    try {
      const next = await startReel(episodeId);
      if (live.current) setReel(next);
    } catch (e) {
      if (live.current) {
        setReel(undefined);
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  if (reel?.status === 'ready') return <ReelPlayer url={reelUrl(reel)} />;
  if (reel?.status === 'unavailable')
    return (
      <View style={styles.note}>
        <Symbol name="film" size={14} color={Theme.plansTone.ink} weight="semibold" />
        <Text style={[Type.footnote, { flex: 1, color: Theme.plansTone.ink }]}>{reel.message}</Text>
      </View>
    );
  if (reel?.status === 'rendering')
    return (
      <View style={styles.note}>
        <ActivityIndicator size="small" color={Theme.accent} />
        <Text style={[Type.footnote, { flex: 1, color: Theme.secondary }]}>Making your reel. It takes about a minute.</Text>
      </View>
    );
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={make} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
        <Symbol name="film" size={13} color={Theme.accent} weight="semibold" />
        <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>{reel?.status === 'failed' ? 'Try the reel again' : 'Make a reel'}</Text>
      </Pressable>
      {reel?.status === 'failed' || error ? <Text style={[Type.caption, { color: Theme.deadline }]}>{error ?? (reel?.status === 'failed' ? reel.error : '')}</Text> : null}
    </View>
  );
}

function ReelPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />;
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: 17, backgroundColor: withAlpha(Theme.accentTone.fill, 0.9) },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: withAlpha(Theme.plansTone.fill, 0.6) },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 420, borderRadius: 14, backgroundColor: '#000', overflow: 'hidden' },
});
