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

/** The liquid glass's rim: bright where the light catches at the top left, a weaker return at the bottom right. */
const liquidRim: ViewStyle = { borderTopColor: 'rgba(255, 255, 255, 0.8)', borderLeftColor: 'rgba(255, 255, 255, 0.45)', borderRightColor: 'rgba(255, 255, 255, 0.14)', borderBottomColor: 'rgba(255, 255, 255, 0.3)' };
const navyRim: ViewStyle = { borderTopColor: 'rgba(83, 105, 121, 1)', borderLeftColor: 'rgba(83, 105, 121, 0.7)', borderRightColor: 'rgba(83, 105, 121, 0.3)', borderBottomColor: 'rgba(83, 105, 121, 0.2)' };

/**
 * The liquid rounded glass every table, card, form, pill and bar uses: a navy tint (so white text holds on bright
 * scenes) over a 14px backdrop blur, an inner top light, and a white rim (the frontpage's Enroll card). light and dark are the same glass; navy is the one
 * near-opaque variant, for sheets that must hide what is under them.
 */
export function Glass({ tone = 'dark', radius = radii.xl, blur = true, style, children, pointerEvents }: { tone?: GlassTone; radius?: number; blur?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode; pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto' }) {
  const navy = tone === 'navy';
  const corner = { borderRadius: radius, borderCurve: 'continuous' as const };
  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        corner,
        {
          overflow: 'hidden',
          backgroundColor: navy ? 'rgba(1, 30, 44, 0.9)' : 'rgba(8, 23, 33, 0.34)',
          boxShadow: navy ? shadows.light.card : shadows.light.inset,
        },
        style,
      ]}>
      {blur ? (
        Platform.OS === 'web' ? (
          // Rounded itself: a backdrop filter is not clipped by its parent's rounded corners in every browser.
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, corner, { backdropFilter: `blur(${navy ? 24 : 14}px)`, WebkitBackdropFilter: `blur(${navy ? 24 : 14}px)` } as object]} />
        ) : (
          <BlurView pointerEvents="none" intensity={navy ? 30 : 16} tint={navy ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, corner]} />
        )
      ) : null}
      {children}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, corner, { borderWidth: 1 }, navy ? navyRim : liquidRim]} />
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
 * The frontpage's section label: a black sticker with white Spencer ("How It works", "Real Dates Delivered"), all in
 * white. accent is kept for callers.
 */
export function Sticker({ text, size = 22, style }: { text: string; accent?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const words = text.split(' ');
  return (
    <View style={[{ alignSelf: 'flex-start', backgroundColor: '#000000', paddingHorizontal: Math.round(size * 0.32), paddingTop: Math.round(size * 0.1), paddingBottom: Math.round(size * 0.04), boxShadow: '0px 3px 10px rgba(8, 16, 34, 0.35)' }, style]}>
      <Text style={{ fontFamily: fonts.serif, fontSize: size, lineHeight: Math.round(size * 1.15), color: '#FFFFFF' }}>
        {words.map((w, i) => (
          <Text key={i}>
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
