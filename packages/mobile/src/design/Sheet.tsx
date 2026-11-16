import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from './haptics';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { radii, space, springs } from './tokens';

/**
 * A bottom sheet over its parent: grabber, emoji + title header, a round close button, and scrolling content.
 * Rises on a spring; Reduce Motion fades it in instead. Render it as the last child of a full-screen view.
 */
export function Sheet({ visible, onClose, title, emoji, subtitle, children }: { visible: boolean; onClose: () => void; title: string; emoji?: string; subtitle?: string; children: ReactNode }) {
  const { c, shadow } = useDesign();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const p = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      p.value = reduced ? withTiming(1, { duration: 180 }) : withSpring(1, springs.sheet);
    } else {
      p.value = withTiming(0, { duration: 200 }, (done) => done && runOnJS(setMounted)(false));
    }
  }, [visible, reduced, p]);
  const scrim = useAnimatedStyle(() => ({ opacity: p.value }));
  const card = useAnimatedStyle(() => (reduced ? { opacity: p.value } : { transform: [{ translateY: (1 - p.value) * 700 }] }));
  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, scrim]}>
        <Pressable accessibilityRole="button" aria-label="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View aria-modal role="dialog" style={[{ position: 'absolute', left: 8, right: 8, bottom: 8, maxHeight: '86%', backgroundColor: c.sheet, borderWidth: 1, borderColor: 'rgba(83, 105, 121, 0.8)', borderRadius: radii.sheet, borderCurve: 'continuous', paddingBottom: Math.max(insets.bottom, space.lg), boxShadow: shadow.float }, card]}>
        <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: c.fillStrong }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Txt accessibilityRole="header" variant="title2">
              {title}
            </Txt>
            {subtitle ? (
              <Txt variant="footnote" tone="secondary">
                {subtitle}
              </Txt>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            aria-label="Close"
            hitSlop={10}
            onPress={() => {
              haptics.tap();
              onClose();
            }}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="subhead" tone="secondary" style={{ fontWeight: '700', fontSize: 14 }}>
              ✕
            </Txt>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.sm, gap: space.md }}>{children}</ScrollView>
      </Animated.View>
    </View>
  );
}
