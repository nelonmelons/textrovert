import { useState, type ReactNode } from 'react';
import { Image, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { fonts } from './fonts';
import { ditto, radii, shadows } from './tokens';

/**
 * The frontpage's scenes (dodo-world/ditto apps/frontpage/public/images), one per place in the app. The names are the
 * places they used to stand for, so screens keep asking for 'clouds', 'dusk' and so on.
 */
export const scenes = {
  /** The painted, dithered sky over rolling hills (austin/sky.webp): Today. */
  clouds: require('../../assets/ditto/painted.jpg'),
  /** Running down a moonlit beach (home/group3-bg-moon2): Ask. */
  dusk: require('../../assets/ditto/moon.jpg'),
  /** A silhouette against the aquarium glass, blue duotone (home/group4-bg): People. */
  ocean: require('../../assets/ditto/aquarium.jpg'),
  /** Two silhouettes, blue duotone (home/group2-bg): You and stats. */
  twilight: require('../../assets/ditto/kiss.jpg'),
  /** The painted landscape, blurred to teal (austin/how-it-works-bg): pushed screens. */
  sky: require('../../assets/ditto/teal.jpg'),
  /** The painted sky again, for the desktop frame. */
  desk: require('../../assets/ditto/painted.jpg'),
} as const;
export type SceneName = keyof typeof scenes;

/** Explicit full size: on web an Image pinned with inset alone keeps its intrinsic size. */
export const fill = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' } as const;

/**
 * A full-bleed scene (the art carries its own halftone dither), with an optional navy scrim for screens whose content
 * needs more contrast, and a soft fade at the top and bottom edges where bars sit.
 */
export function Backdrop({ scene = 'sky', scrim = 0, fade = true }: { scene?: SceneName; scrim?: number; fade?: boolean }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: ditto.skyTop, overflow: 'hidden' }]}>
      <Image source={scenes[scene]} resizeMode="cover" style={fill} />
      {scrim ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(8, 16, 34, ${scrim})` }]} /> : null}
      {fade ? <LinearGradient colors={['rgba(12, 34, 80, 0.22)', 'rgba(12, 34, 80, 0)', 'rgba(12, 34, 80, 0)', 'rgba(8, 16, 34, 0.42)']} locations={[0, 0.2, 0.7, 1]} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

/** A screen on a Ditto scene: the backdrop fills it and children render above. */
export function SceneView({ scene = 'sky', scrim, children, style }: { scene?: SceneName; scrim?: number; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1 }, style]}>
      <Backdrop scene={scene} scrim={scrim} />
      {children}
    </View>
  );
}

type GlassTone = 'light' | 'dark' | 'navy';

/** Per-edge rims that stand in for the frontpage's masked gradient rings (bright where the light catches). */
const rims: Record<GlassTone, ViewStyle> = {
  /** Form glass: the Enroll card's white ring, bright top-left, a weaker return streak bottom-right. */
  light: { borderTopColor: 'rgba(255, 255, 255, 0.8)', borderLeftColor: 'rgba(255, 255, 255, 0.45)', borderRightColor: 'rgba(255, 255, 255, 0.14)', borderBottomColor: 'rgba(255, 255, 255, 0.3)' },
  /** House glass: the FAQ card's slate ring. */
  dark: { borderTopColor: 'rgba(83, 105, 121, 1)', borderLeftColor: 'rgba(83, 105, 121, 0.7)', borderRightColor: 'rgba(83, 105, 121, 0.3)', borderBottomColor: 'rgba(83, 105, 121, 0.2)' },
  navy: { borderTopColor: 'rgba(83, 105, 121, 1)', borderLeftColor: 'rgba(83, 105, 121, 0.7)', borderRightColor: 'rgba(83, 105, 121, 0.3)', borderBottomColor: 'rgba(83, 105, 121, 0.2)' },
};
const fills: Record<GlassTone, string> = { light: 'rgba(255, 255, 255, 0.1)', dark: 'rgba(1, 30, 44, 0.4)', navy: 'rgba(1, 30, 44, 0.9)' };
const blurs: Record<GlassTone, number> = { light: 10, dark: 24, navy: 24 };

/**
 * The frontpage's two glasses. dark is the FAQ card's house glass (#011E2C at 40%, blur 24, slate rim) for lists and
 * cards of white copy; light is the Enroll card's form glass (white/10, blur 10, an inner top light, a white rim) for
 * forms, fields' cards, pills and bars; navy is the house glass near-opaque, for sheets.
 */
export function Glass({ tone = 'dark', radius = radii.xl, blur = true, style, children, pointerEvents }: { tone?: GlassTone; radius?: number; blur?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode; pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto' }) {
  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        {
          borderRadius: radius,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: fills[tone],
          boxShadow: tone === 'light' ? shadows.light.inset : shadows.light.card,
        },
        style,
      ]}>
      {blur ? (
        Platform.OS === 'web' ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backdropFilter: `blur(${blurs[tone]}px)`, WebkitBackdropFilter: `blur(${blurs[tone]}px)` } as object]} />
        ) : (
          <BlurView pointerEvents="none" intensity={tone === 'light' ? 16 : 30} tint={tone === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
        )
      ) : null}
      {children}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderCurve: 'continuous', borderWidth: 1 }, rims[tone]]} />
    </View>
  );
}

/**
 * The frontpage's scalloped section edge: a row of small rounded teeth along the top of a section, like a pinking-shear
 * cut. Draw it directly above a block of the same colour.
 */
export function Scallop({ color = ditto.teal, height = 10, period = 16 }: { color?: string; height?: number; period?: number }) {
  const [width, setWidth] = useState(0);
  const teeth = Math.ceil(width / period) + 1;
  let d = `M0 ${height}`;
  for (let i = 0; i < teeth; i++) {
    const x = i * period;
    d += ` Q${x + period / 2} ${-height * 0.55} ${x + period} ${height}`;
  }
  d += ` L${teeth * period} ${height + 2} L0 ${height + 2} Z`;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} pointerEvents="none" style={{ height, marginBottom: -1 }}>
      {width ? (
        <Svg width={width} height={height + 2} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Path d={d} fill={color} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * The frontpage's section label: a black sticker with white Spencer and one word in Ditto pink ("How It works", "Real
 * Dates Delivered"). accent picks the pink word; by default it is the last one.
 */
export function Sticker({ text, accent, size = 22, style }: { text: string; accent?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const words = text.split(' ');
  const pink = accent ?? (words.length > 1 ? words[words.length - 1] : '');
  return (
    <View style={[{ alignSelf: 'flex-start', backgroundColor: '#000000', paddingHorizontal: Math.round(size * 0.32), paddingTop: Math.round(size * 0.1), paddingBottom: Math.round(size * 0.04), boxShadow: '0px 3px 10px rgba(8, 16, 34, 0.35)' }, style]}>
      <Text style={{ fontFamily: fonts.serif, fontSize: size, lineHeight: Math.round(size * 1.15), color: '#FFFFFF' }}>
        {words.map((w, i) => (
          <Text key={i} style={w === pink ? { color: ditto.primary } : undefined}>
            {i ? ' ' : ''}
            {w}
          </Text>
        ))}
      </Text>
    </View>
  );
}

/** textrovert's wordmark, set like Ditto's: a heavy rounded sans in white. */
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <Text style={{ fontFamily: fonts.wordmark, fontSize: size, lineHeight: Math.round(size * 1.2), color: '#FFFFFF', letterSpacing: -0.4, textShadowColor: 'rgba(12, 34, 80, 0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
      textrovert
    </Text>
  );
}
