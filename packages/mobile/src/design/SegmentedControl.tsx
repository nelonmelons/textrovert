import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';

import { Glass } from './Backdrop';
import { haptics } from './haptics';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { radii, springs } from './tokens';

/** Ditto's selection pills: a glass track with a white thumb that springs between segments; the chosen one reads pink. */
export function SegmentedControl({ segments, value, onChange }: { segments: string[]; value: number; onChange: (index: number) => void }) {
  const { c, shadow } = useDesign();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const seg = width ? (width - 8) / segments.length : 0;
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? withTiming(value * seg, { duration: 0 }) : withSpring(value * seg, springs.snappy) }] }), [value, seg, reduced]);
  return (
    <Glass tone="light" radius={radii.pill}>
      <View role="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', height: 44, padding: 4 }}>
        {seg ? <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: seg, borderRadius: radii.pill, backgroundColor: c.thumb, boxShadow: shadow.thumb }, thumb]} /> : null}
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
            <Txt variant="subhead" color={i === value ? c.keyInk : c.text} style={{ fontWeight: '700', fontSize: 14 }}>
              {s}
            </Txt>
          </Pressable>
        ))}
      </View>
    </Glass>
  );
}
