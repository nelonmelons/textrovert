import { useEffect } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useDesign } from './theme';
import { Txt } from './Txt';
import { fillFor, fills, springs, type FillName } from './tokens';

export interface EmojiAvatarProps {
  /** Seeds the fill colour and the initials. */
  name?: string;
  emoji?: string;
  image?: ImageSourcePropType;
  /** Overrides the fill picked from the name. */
  color?: FillName;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** A saturated circle with a darker ring holding an emoji, a character image, or initials. */
export function EmojiAvatar({ name, emoji, image, color, size = 48, style }: EmojiAvatarProps) {
  const { shadow } = useDesign();
  const f = fills[color ?? fillFor(name ?? emoji ?? '?')];
  const ring = Math.max(2, Math.round(size * 0.054));
  return (
    <View
      aria-label={name}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: f.fill, boxShadow: shadow.avatar }, style]}>
      <View style={{ flex: 1, borderRadius: size / 2, borderWidth: ring, borderColor: f.edge, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {image ? (
          <Image source={image} resizeMode="contain" style={{ width: size * 0.9, height: size * 0.9, marginTop: size * 0.12 }} />
        ) : emoji ? (
          <Txt style={{ fontSize: size * 0.5, lineHeight: size * 0.62, textAlign: 'center' }}>{emoji}</Txt>
        ) : (
          <Txt color={f.ink} style={{ fontSize: size * 0.36, lineHeight: size * 0.44, fontWeight: '700', letterSpacing: -0.3 }}>
            {initials(name ?? '?')}
          </Txt>
        )}
      </View>
    </View>
  );
}

/**
 * Overlapping avatars, the first on top. With bounce on, each avatar hops in turn every few seconds, unless
 * Reduce Motion is on.
 */
export function AvatarStack({ people, size = 48, max = 7, overlap = 0.26, bounce = false, style }: { people: EmojiAvatarProps[]; size?: number; max?: number; overlap?: number; bounce?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useDesign();
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      {shown.map((p, i) => (
        <Hop key={i} index={i} count={shown.length} on={bounce} style={{ marginLeft: i ? -size * overlap : 0, zIndex: shown.length - i }}>
          <EmojiAvatar {...p} size={size} />
        </Hop>
      ))}
      {rest > 0 ? (
        <View style={{ marginLeft: -size * overlap, width: size, height: size, borderRadius: size / 2, backgroundColor: c.grouped, borderWidth: Math.max(2, Math.round(size * 0.054)), borderColor: c.edge, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="headline" tone="secondary" style={{ fontSize: size * 0.3 }}>
            +{rest}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function Hop({ index, count, on, style, children }: { index: number; count: number; on: boolean; style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!on || reduced) return;
    const step = 140;
    y.value = withDelay(
      600 + index * step,
      withRepeat(withSequence(withTiming(-7, { duration: 160 }), withSpring(0, springs.release), withTiming(0, { duration: 3200 + (count - index) * step })), -1),
    );
  }, [on, reduced, index, count, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
