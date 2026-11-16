import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptics } from './haptics';
import { springs } from './tokens';

export interface TactileProps {
  /** Face colour, or a top-to-bottom gradient. */
  face: string | readonly [string, string];
  /** The darker edge: the ring around the face and the lip under it. */
  edge: string;
  radius: number;
  lip: number;
  ring?: number;
  onPress?: () => void;
  haptic?: 'tap' | 'thud' | 'none';
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * A surface sitting on a solid lip of its edge colour. Pressing springs the face down onto the lip, so it feels
 * like a physical key; Reduce Motion swaps the spring for a short fade-free step.
 */
export function Tactile({ face, edge, radius, lip, ring = 0, onPress, haptic = 'tap', accessibilityLabel, disabled, style, faceStyle, children }: TactileProps) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();
  const sink = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.value * lip }] }));
  const corner = { borderRadius: radius, borderCurve: 'continuous' as const };
  const surface = (
    <View style={[{ paddingBottom: lip }, style]}>
      <View style={[StyleSheet.absoluteFill, corner, { top: lip, backgroundColor: edge }]} />
      <Animated.View
        style={[
          corner,
          { overflow: 'hidden', borderWidth: ring, borderColor: edge, backgroundColor: typeof face === 'string' ? face : face[1] },
          faceStyle,
          sink,
        ]}>
        {typeof face === 'string' ? null : <LinearGradient colors={face} style={StyleSheet.absoluteFill} />}
        {children}
      </Animated.View>
    </View>
  );
  if (!onPress) return surface;
  const to = (v: number, release: boolean) => (reduced ? withTiming(v, { duration: 60 }) : withSpring(v, release ? springs.release : springs.press));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = to(1, false);
        if (haptic !== 'none') haptics[haptic]();
      }}
      onPressOut={() => (pressed.value = to(0, true))}
      style={{ opacity: disabled ? 0.5 : 1 }}>
      {surface}
    </Pressable>
  );
}

/** Shrinks a touch under the finger and springs back; for rows of content rather than keys. */
export function PressScale({ onPress, children, style, outerStyle, scale = 0.97, haptic = true, accessibilityLabel }: { onPress?: () => void; children: ReactNode; style?: StyleProp<ViewStyle>; outerStyle?: StyleProp<ViewStyle>; scale?: number; haptic?: boolean; accessibilityLabel?: string }) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - pressed.value * (1 - scale) }], opacity: reduced ? 1 - pressed.value * 0.3 : 1 }));
  const to = (v: number) => (reduced ? withTiming(v, { duration: 80 }) : withSpring(v, v ? springs.press : springs.release));
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = to(1);
        if (haptic) haptics.select();
      }}
      onPressOut={() => (pressed.value = to(0))}
      style={outerStyle}>
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}
