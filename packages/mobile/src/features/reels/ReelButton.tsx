import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { BigButton, space, Txt, useDesign } from '@/design';
import { fetchReel, reelUrl, startReel, type Reel } from '../../api/friend';
import { haptics } from '../../lib/haptics';

const POLL_MS = 3000;
const CAMERA = require('../../../assets/art/hedgehog-camera.png');

/** "Make a reel" for one episode: starts a render, polls until it is ready, then plays it inline. */
export function ReelButton({ episodeId }: { episodeId: number }) {
  const { c } = useDesign();
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
  if (reel?.status === 'unavailable' || reel?.status === 'rendering')
    return (
      <View style={[styles.note, { backgroundColor: c.grouped }]}>
        {reel.status === 'rendering' ? <ActivityIndicator color={c.accent} /> : <Txt style={{ fontSize: 18 }}>🎬</Txt>}
        <Txt variant="subhead" tone="secondary" style={{ flex: 1 }}>
          {reel.status === 'rendering' ? 'Making your reel. It takes about a minute.' : reel.message}
        </Txt>
      </View>
    );
  return (
    <View style={{ gap: space.sm }}>
      <BigButton title={reel?.status === 'failed' ? 'Try the reel again' : 'Make a reel'} image={CAMERA} kind="secondary" onPress={make} />
      {reel?.status === 'failed' || error ? (
        <Txt variant="footnote" color={c.danger}>
          {error ?? (reel?.status === 'failed' ? reel.error : '')}
        </Txt>
      ) : null}
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
  note: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: 20, borderCurve: 'continuous' },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 420, borderRadius: 20, backgroundColor: '#000', overflow: 'hidden' },
});
