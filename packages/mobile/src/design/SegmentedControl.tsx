import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';

import { haptics } from './haptics';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { springs } from './tokens';

/** The iOS segmented control: a grey track with a white thumb that springs between segments. */
export function SegmentedControl({ segments, value, onChange }: { segments: string[]; value: number; onChange: (index: number) => void }) {
  const { c, shadow } = useDesign();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const seg = width ? (width - 4) / segments.length : 0;
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? withTiming(value * seg, { duration: 0 }) : withSpring(value * seg, springs.snappy) }] }), [value, seg, reduced]);
  return (
    <View role="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', height: 36, padding: 2, borderRadius: 10, backgroundColor: c.fill }}>
      {seg ? <Animated.View style={[{ position: 'absolute', top: 2, bottom: 2, left: 2, width: seg, borderRadius: 8, backgroundColor: c.thumb, boxShadow: shadow.thumb }, thumb]} /> : null}
      {segments.map((s, i) => (
        <Pressable
          key={s}
          role="tab"
          aria-selected={i === value}
          onPress={() => {
            if (i === value) return;
            haptics.select();
            onChange(i);
          }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="subhead" style={{ fontWeight: i === value ? '600' : '500', fontSize: 14 }}>
            {s}
          </Txt>
        </Pressable>
      ))}
    </View>
  );
}
