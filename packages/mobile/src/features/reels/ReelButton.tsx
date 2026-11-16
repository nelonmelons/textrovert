import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchReel, reelUrl, startReel, type Reel } from '../../api/friend';
import { Icon, PillButton } from '@/design';
import { haptics } from '../../lib/haptics';
import { Theme, Type } from '../../theme';

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
        <Icon name="film" size={14} color="rgba(255, 255, 255, 0.8)" />
        <Text style={[Type.footnote, { flex: 1, color: Theme.secondary }]}>{reel.message}</Text>
      </View>
    );
  if (reel?.status === 'rendering')
    return (
      <View style={styles.note}>
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={[Type.footnote, { flex: 1, color: Theme.secondary }]}>Making your reel. It takes about a minute.</Text>
      </View>
    );
  return (
    <View style={{ gap: 6 }}>
      <PillButton small title={reel?.status === 'failed' ? 'Try the reel again' : 'Make a reel'} icon={<Icon name="film" size={12} />} onPress={make} />
      {reel?.status === 'failed' || error ? <Text style={[Type.caption, { color: '#FF7BCB' }]}>{error ?? (reel?.status === 'failed' ? reel.error : '')}</Text> : null}
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
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.14)' },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 420, borderRadius: 20, backgroundColor: '#081721', overflow: 'hidden' },
});
