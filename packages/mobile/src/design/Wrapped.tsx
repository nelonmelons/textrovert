import { useEffect, type ReactNode } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIconTile } from './AppIconTile';
import { EmojiAvatar, type EmojiAvatarProps } from './EmojiAvatar';
import { Tactile } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { fills, lip, mix, radii, space, type FillName } from './tokens';

/** A slide's pale wash of its accent: near-white in light mode, near-black in dark. */
export function useWash(accent: FillName) {
  const { scheme, c } = useDesign();
  return mix(fills[accent].fill, c.background, scheme === 'dark' ? 0.86 : 0.84);
}

/** Story progress: one segment per slide, filled up to the current one. */
export function StoryProgress({ count, index }: { count: number; index: number }) {
  const { c } = useDesign();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} aria-label={`Slide ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? c.text : c.fillStrong }} />
      ))}
    </View>
  );
}

/**
 * One Wrapped story slide: a pale wash of a single bright accent, progress at the top, an emoji eyebrow, the
 * slide body, and an optional footer pinned to the bottom (buttons, "tap to continue").
 */
export function StorySlide({ accent, index, count, eyebrow, children, footer }: { accent: FillName; index: number; count: number; eyebrow?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const wash = useWash(accent);
  return (
    <View style={{ flex: 1, backgroundColor: wash, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.gutter }}>
      <StoryProgress count={count} index={index} />
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        {eyebrow ? <StoryEyebrow text={eyebrow} accent={accent} /> : null}
        {children}
      </View>
      {footer ? <View style={{ gap: space.md }}>{footer}</View> : null}
    </View>
  );
}

/** A capsule label in the slide's accent. */
export function StoryEyebrow({ text, accent }: { text: string; accent: FillName }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: fills[accent].fill, borderRadius: radii.pill, borderBottomWidth: 2, borderBottomColor: fills[accent].edge, paddingHorizontal: 12, paddingVertical: 5 }}>
      <Txt variant="footnote" color={fills[accent].ink} style={{ fontWeight: '600' }}>
        {text}
      </Txt>
    </View>
  );
}

/** The slide headline: the big tight hero type. */
export function StoryTitle({ children, center }: { children: string; center?: boolean }) {
  return (
    <Txt accessibilityRole="header" variant="display" style={{ fontSize: 44, lineHeight: 48, letterSpacing: -1.4, textAlign: center ? 'center' : 'left' }}>
      {children}
    </Txt>
  );
}

/** Two big avatar keys for "who said it": tap the person you think sent the quote. */
export function GuessButtons({ people, onGuess }: { people: [EmojiAvatarProps & { id: string; name: string }, EmojiAvatarProps & { id: string; name: string }]; onGuess: (id: string) => void }) {
  const { c } = useDesign();
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      {people.map((p) => (
        <View key={p.id} style={{ flex: 1 }}>
          <Tactile face={c.surface} edge={c.edge} radius={radii.xl} lip={lip.card} ring={2} haptic="thud" onPress={() => onGuess(p.id)} accessibilityLabel={`Guess ${p.name}`} faceStyle={{ alignItems: 'center', paddingVertical: space.xl, gap: space.md }}>
            <EmojiAvatar {...p} size={84} />
            <Txt variant="title3" numberOfLines={1}>
              {p.name.split(' ')[0]}
            </Txt>
          </Tactile>
        </View>
      ))}
    </View>
  );
}

/** A big counted number with its emoji tile and label; the ghost-era and busiest-day figure. */
export function BigNumberTile({ value, label, emoji, accent, bob = false }: { value: string; label: string; emoji: string; accent: FillName; bob?: boolean }) {
  const { c, shadow } = useDesign();
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!bob || reduced) return;
    y.value = withRepeat(withSequence(withTiming(-8, { duration: 1100, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) })), -1);
  }, [bob, reduced, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radii.xxl, borderCurve: 'continuous', padding: space.xl, gap: space.lg, boxShadow: shadow.card }}>
      <Animated.View style={[{ alignSelf: 'flex-start' }, anim]}>
        <AppIconTile emoji={emoji} color={accent} size={72} />
      </Animated.View>
      <View>
        <Txt variant="stat" style={{ fontSize: 96, lineHeight: 100, letterSpacing: -4 }}>
          {value}
        </Txt>
        <Txt variant="title3" tone="secondary">
          {label}
        </Txt>
      </View>
    </View>
  );
}

/** Horizontal bars for a ranked list of durations (reply gaps), the longest in the accent. */
export function GapBars({ items, accent }: { items: { label: string; fraction: number }[]; accent: FillName }) {
  const { c } = useDesign();
  return (
    <View style={{ gap: space.sm }}>
      {items.map((g, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: c.fill, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(6, g.fraction * 100)}%`, height: '100%', borderRadius: 7, backgroundColor: i === 0 ? fills[accent].fill : fills[accent].edge, opacity: i === 0 ? 1 : 0.45 }} />
          </View>
          <Txt variant="footnote" tone="secondary" style={{ width: 64, textAlign: 'right', fontWeight: '600' }}>
            {g.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** The mascot art in a big accent circle, for openers and finales. */
export function MascotBadge({ image, accent, size = 168 }: { image: ImageSourcePropType; accent: FillName; size?: number }) {
  const { shadow } = useDesign();
  const f = fills[accent];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: f.fill, borderWidth: 4, borderColor: f.edge, boxShadow: shadow.avatar, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Image source={image} resizeMode="contain" style={{ width: size * 0.86, height: size * 0.86 }} />
    </View>
  );
}

/** A numbered recap line: index in an accent circle, then the headline. */
export function RecapRow({ index, text, emoji, accent }: { index: number; text: string; emoji: string; accent: FillName }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} accessible accessibilityLabel={`${index}. ${text}`}>
      <EmojiAvatar emoji={emoji} color={accent} size={40} />
      <Txt variant="headline" style={{ flex: 1 }}>
        {text}
      </Txt>
      <Txt variant="footnote" tone="tertiary" style={{ fontWeight: '600' }}>
        {String(index).padStart(2, '0')}
      </Txt>
    </View>
  );
}
