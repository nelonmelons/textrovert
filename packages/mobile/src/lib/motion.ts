import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Animated's native driver where it exists; web animates on the JS side. */
export const nativeDriver = Platform.OS !== 'web';

/** Whether the system asks for less motion (Reduce Motion on iOS, prefers-reduced-motion on web). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduced(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
