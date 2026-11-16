import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { nativeDriver, useReducedMotion } from '@/lib/motion';

/** Fades and lifts its children into place once, on mount. With Reduce Motion on it only fades. */
export function FadeIn({ children, delay = 0, from = 10, style }: { children: ReactNode; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: reduced ? 150 : 320, delay: reduced ? 0 : delay, useNativeDriver: nativeDriver }).start();
  }, [progress, delay, reduced]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : from, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
