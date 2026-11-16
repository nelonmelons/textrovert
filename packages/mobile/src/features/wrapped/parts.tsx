import { SymbolView } from 'expo-symbols';
import { createContext, useContext, useEffect, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, RadialGradient, Stop, Text as SvgText, TSpan } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { firstName, formatDate, type WrappedDateRange, type WrappedParticipant, type WrappedQuote } from '@textrovert/wrapped';

import { displaySize, displayStyle, fonts, lift, rainbowRing, text, type DisplayType, type World } from './theme';

/** Everything a slide needs to name people and dates. */
export interface Story {
  owner: WrappedParticipant;
  friend: WrappedParticipant;
  service: string;
  range: WrappedDateRange;
  locale: string;
  world: World;
}

export const friendName = (s: Story) => firstName(s.friend);
export const stamp = (s: Story, ms: number) => formatDate(ms, 'MMMdjmm', s.range.timeZone, s.locale);
export const dayLabel = (s: Story, ms: number) => formatDate(ms, 'MMMd', s.range.timeZone, s.locale);
export const isOwner = (s: Story, q: WrappedQuote) => q.speakerID === s.owner.id;
export const who = (s: Story, q: WrappedQuote) => (isOwner(s, q) ? 'You' : friendName(s));
export const attribution = (s: Story, q: WrappedQuote) => `${who(s, q)} · ${stamp(s, q.sentAt)} · ${q.service}`;

/** The slide being shown: whether it is the active one, and where its heading registers for focus. */
export type HeadingRef = RefObject<ComponentRef<typeof View> | null>;
export const SlideContext = createContext<{ active: boolean; heading: HeadingRef | null }>({ active: true, heading: null });
export const useSlide = () => useContext(SlideContext);

export const useReduced = () => useReducedMotion();

/** Fade in and rise from +distance; spring 0.6 s, damping 0.8, delayed order × 90 ms. Reduce Motion: a 0.1 s fade. */
export function Enter({ active, order = 0, distance = 28, style, children }: { active?: boolean; order?: number; distance?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const slide = useSlide();
  const on = active ?? slide.active;
  const reduced = useReduced();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!on) p.value = 0;
    else p.value = reduced ? withTiming(1, { duration: 100 }) : withDelay(order * 90, withSpring(1, { duration: 600, dampingRatio: 0.8 }));
  }, [on, reduced, order, p]);
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(p.value, 0), 1),
    transform: [{ translateY: reduced ? 0 : (1 - p.value) * distance }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A number that follows `target` over `duration` ms, for count-ups and drawn strokes. Instant under Reduce Motion. */
export function useTween(target: number, duration: number, delay = 0, from = 0): number {
  const reduced = useReduced();
  const sv = useSharedValue(reduced ? target : from);
  const [value, setValue] = useState(reduced ? target : from);
  useEffect(() => {
    sv.value = reduced ? target : withDelay(delay, withTiming(target, { duration, easing: Easing.out(Easing.cubic) }));
  }, [target, duration, delay, reduced, sv]);
  useAnimatedReaction(() => sv.value, (v, prev) => {
    if (v !== prev) scheduleOnRN(setValue, v);
  });
  return value;
}

/** A repeating 0 → 1 → 0 (or 0 → 1 when `loop`) progress, frozen at `rest` under Reduce Motion or when inactive. */
export function useRepeat(durationMs: number, { active = true, loop = false, rest = 0 }: { active?: boolean; loop?: boolean; rest?: number } = {}): SharedValue<number> {
  const reduced = useReduced();
  const p = useSharedValue(rest);
  useEffect(() => {
    if (reduced || !active) {
      p.value = rest;
      return;
    }
    p.value = 0;
    p.value = loop
      ? withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false)
      : withRepeat(withSequence(withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: durationMs, easing: Easing.inOut(Easing.ease) })), -1, false);
  }, [reduced, active, loop, durationMs, rest, p]);
  return p;
}

function GlowBlob({ color, index, clock, w, h }: { color: string; index: number; clock: SharedValue<number>; w: number; h: number }) {
  const r = Math.min(w, h) * 0.48;
  const style = useAnimatedStyle(() => {
    const t = clock.value * 3600;
    const phase = index * 2.1;
    const x = w * (0.5 + 0.38 * Math.sin(t * 0.21 + phase));
    const y = h * (0.5 + 0.38 * Math.cos(t * 0.17 + phase * 1.3));
    const scale = (0.42 + 0.06 * Math.sin(t * 0.3 + phase)) / 0.48;
    return { transform: [{ translateX: x - r }, { translateY: y - r }, { scale }] };
  });
  const id = 'glow' + index;
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: r * 2, height: r * 2 }, style]}>
      <Svg width={r * 2} height={r * 2}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Slowly drifting colour fields behind a slide. Static under Reduce Motion or when the slide isn't active. */
export function Glow({ colors, active = true }: { colors: string[]; active?: boolean }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const clock = useRepeat(3_600_000, { active, loop: true });
  return (
    <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size ? colors.map((c, i) => <GlowBlob key={i} color={c} index={i} clock={clock} w={size.w} h={size.h} />) : null}
    </View>
  );
}

/** Twinkling stars for the ghost scene. */
export function Stars({ color, active = true }: { color: string; active?: boolean }) {
  return (
    <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
      {Array.from({ length: 46 }, (_, i) => (
        <Star key={i} i={i} color={color} active={active} />
      ))}
    </View>
  );
}

function Star({ i, color, active }: { i: number; color: string; active: boolean }) {
  const p = useRepeat(1100 + (i % 7) * 260, { active, rest: 0.6 });
  const size = 1.2 + (2.2 * ((i * 31) % 5)) / 5;
  const style = useAnimatedStyle(() => ({ opacity: (0.35 + 0.65 * p.value) * 0.8 }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: `${((i * 7919) % 1000) / 10}%`, top: `${((i * 104729) % 1000) / 10}%`, width: size, height: size, borderRadius: size, backgroundColor: color }, style]}
    />
  );
}

/** A ring of the rainbow, rotating once a minute (static under Reduce Motion). */
export function RainbowRing({ size, stroke, active = true }: { size: number; stroke: number; active?: boolean }) {
  const turn = useRepeat(60_000, { active, loop: true });
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const r = (size - stroke) / 2;
  const c = size / 2;
  const segments = 72;
  const colorAt = (t: number) => {
    const x = t * (rainbowRing.length - 1);
    const i = Math.min(Math.floor(x), rainbowRing.length - 2);
    return mixHex(rainbowRing[i], rainbowRing[i + 1], x - i);
  };
  const arcs = Array.from({ length: segments }, (_, k) => {
    const a0 = (k / segments) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 1.6) / segments) * Math.PI * 2 - Math.PI / 2;
    const d = `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
    return <Path key={k} d={d} stroke={colorAt(k / segments)} strokeWidth={stroke} fill="none" />;
  });
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>{arcs}</Svg>
    </Animated.View>
  );
}

function mixHex(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

export function Eyebrow({ text: label, color }: { text: string; color: string }) {
  return <Text style={{ ...text.caption, fontFamily: fonts.rounded, fontWeight: '700', letterSpacing: 2.2, color, textTransform: 'uppercase', ...lift }}>{label}</Text>;
}

/** Ditto's primary key with a tap glyph: the white/95 pill with bold pink ink. color and ink are ignored. */
export function TapPill({ title, testID, onPress }: { title: string; color?: string; ink?: string; testID: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.pill, styles.key, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <Text style={{ ...text.headline, fontFamily: fonts.rounded, fontWeight: '700', color: DITTO_PINK }}>{title}</Text>
      <SymbolView name={{ ios: 'hand.tap.fill', android: 'touch_app', web: 'touch_app' }} tintColor={DITTO_PINK} size={18} />
    </Pressable>
  );
}

/** A full-width capsule: with a fill, Ditto's white key with pink ink; without, the white/10 glass pill. */
export function WideButton({ title, fill, testID, onPress, icon }: { title: string; fill: string | null; ink?: string; testID: string; onPress: () => void; icon?: Parameters<typeof SymbolView>[0]['name'] }) {
  const ink = fill ? DITTO_PINK : '#FFFFFF';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.wide, fill ? styles.key : styles.glass, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {icon ? <SymbolView name={icon} tintColor={ink} size={18} /> : null}
      <Text style={{ ...text.headline, fontFamily: fonts.rounded, fontWeight: '700', color: ink }}>{title}</Text>
    </Pressable>
  );
}

/** Display type sized by length; registers as the slide's heading when `heading` is set. */
export function DisplayText({ text: value, type = 'serifItalic', color, heading = false, style }: { text: string; type?: DisplayType; color: string; heading?: boolean; style?: StyleProp<TextStyle> }) {
  const slide = useSlide();
  const size = displaySize(value);
  const view = (
    <Text accessibilityLabel={value} accessibilityRole={heading ? 'header' : undefined} style={[displayStyle(type, size), { color }, style]}>
      {value}
    </Text>
  );
  return heading ? <View ref={slide.heading ?? undefined}>{view}</View> : view;
}

/**
 * Lines of text filled with a left-to-right gradient, drawn as SVG so it works the same on iOS and web. Shrinks to
 * fit the width (an estimate from `widthPerChar` × size), like SwiftUI's minimumScaleFactor down to `minScale`.
 */
export function GradientText({ lines, colors, size, family, weight, italic = false, lineHeight = 1.0, widthPerChar = 0.58, minScale = 0.5, label, heading = false }: {
  lines: string[]; colors: string[]; size: number; family?: string; weight: TextStyle['fontWeight']; italic?: boolean; lineHeight?: number; widthPerChar?: number; minScale?: number; label: string; heading?: boolean;
}) {
  const slide = useSlide();
  const [width, setWidth] = useState(0);
  const longest = Math.max(...lines.map((l) => [...l].length), 1);
  const fit = width > 0 ? Math.max(minScale, Math.min(1, width / (longest * size * widthPerChar))) : 1;
  const fs = size * fit;
  const lh = fs * lineHeight;
  const height = lh * lines.length + fs * 0.25;
  const id = 'gt' + label.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) + lines.length;
  return (
    <View
      ref={heading ? (slide.heading ?? undefined) : undefined}
      accessible
      accessibilityRole={heading ? 'header' : 'text'}
      accessibilityLabel={label}
      style={{ alignSelf: 'stretch', height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height} aria-hidden>
          <Defs>
            <SvgLinearGradient id={id} x1="0" y1="0" x2={String(Math.min(width, longest * fs * widthPerChar))} y2="0" gradientUnits="userSpaceOnUse">
              {colors.map((c, i) => (
                <Stop key={i} offset={String(i / (colors.length - 1))} stopColor={c} />
              ))}
            </SvgLinearGradient>
          </Defs>
          <SvgText fill={`url(#${id})`} fontSize={fs} fontFamily={family} fontWeight={weight as never} fontStyle={italic ? 'italic' : 'normal'}>
            {lines.map((l, i) => (
              <TSpan key={i} x={0} y={lh * i + fs * 0.92}>
                {l}
              </TSpan>
            ))}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

/** One verified message as a chat bubble, its source line beneath, read as one element. */
export function Bubble({ quote, story, fill, color, caption }: { quote: WrappedQuote; story: Story; fill: string; color: string; caption: string }) {
  const mine = isOwner(story, quote);
  return (
    <View accessible accessibilityLabel={`${who(story, quote)} said, ${quote.text}. ${attribution(story, quote)}`} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
      <View
        style={{
          backgroundColor: fill, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '88%', boxShadow: '0px 6px 18px rgba(4, 12, 18, 0.18)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: mine ? 20 : 6, borderBottomRightRadius: mine ? 6 : 20,
        }}>
        <Text style={{ ...text.title3, fontFamily: fonts.rounded, fontWeight: '400', color }}>{quote.text}</Text>
      </View>
      <Text style={{ ...text.caption, fontFamily: fonts.rounded, fontWeight: '700', color: caption, ...lift }}>{attribution(story, quote)}</Text>
    </View>
  );
}

/** A slide's vertical scroll: top 88 and bottom 124 clear the progress bar and the Back/Next bar. */
export function Scroll({ bottom = 124, children }: { bottom?: number; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 88 + insets.top, paddingBottom: bottom + insets.bottom }}>
      {children}
    </ScrollView>
  );
}

export function Footnote({ children, color }: { children: string; color: string }) {
  return <Text style={{ ...text.footnote, fontFamily: fonts.rounded, color, ...lift }}>{children}</Text>;
}

// Shapes from WrappedTheme.swift, as SVG paths.

export function slantedHalf(w: number, h: number, leading: boolean) {
  const slant = w * 0.06, split = w / 2;
  return leading
    ? `M0 0 L${split + slant} 0 L${split - slant} ${h} L0 ${h} Z`
    : `M${split + slant} 0 L${w} 0 L${w} ${h} L${split - slant} ${h} Z`;
}

export function ticketPath(w: number, h: number, stub = 96) {
  const r = 22, x = w - stub;
  return `M0 0 L${x - r} 0 A${r} ${r} 0 0 0 ${x + r} 0 L${w} 0 L${w} ${h} L${x + r} ${h} A${r} ${r} 0 0 0 ${x - r} ${h} L0 ${h} Z`;
}

export function ghostPath(w: number, h: number) {
  let d = `M0 ${h * 0.5} C0 ${-h * 0.12} ${w} ${-h * 0.12} ${w} ${h * 0.5} L${w} ${h}`;
  const teeth = 4, step = w / teeth;
  for (let i = 0; i < teeth; i++) {
    const x0 = w - i * step;
    d += ` Q${x0 - step / 2} ${h * 0.76} ${x0 - step} ${h}`;
  }
  return d + ' Z';
}

export function tangentPath(w: number, h: number) {
  return `M0 ${h * 0.22} L${w * 0.44} ${h * 0.22} C${w * 0.74} ${h * 0.22} ${w * 0.42} ${h * 0.72} ${w * 0.6} ${h * 0.88} C${w * 0.8} ${h * 1.02} ${w * 0.82} ${h * 0.45} ${w * 0.97} ${h * 0.45}`;
}

const DITTO_PINK = '#FF2CAB';

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 10, paddingHorizontal: 22, paddingVertical: 14, minHeight: 48, borderRadius: 999 },
  wide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, minHeight: 52, borderRadius: 999, alignSelf: 'stretch' },
  key: { backgroundColor: 'rgba(255, 255, 255, 0.95)', boxShadow: '0px 2px 8px rgba(4, 12, 18, 0.18)' },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    boxShadow: 'inset 0px 0px 8px 0px rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
    borderLeftColor: 'rgba(255, 255, 255, 0.32)',
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomColor: 'rgba(255, 255, 255, 0.16)',
  },
});
