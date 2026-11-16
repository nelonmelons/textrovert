import { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';

/** Three dots pulsing in turn while the assistant works. */
export function TypingDots({ color }: { color: string }) {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.stagger(
        160,
        values.map((v) =>
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: native }),
            Animated.timing(v, { toValue: 0.3, duration: 280, useNativeDriver: native }),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [values]);
  return (
    <View accessibilityLabel="Typing" style={{ flexDirection: 'row', gap: 5, paddingVertical: 4 }}>
      {values.map((v, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: v }} />
      ))}
    </View>
  );
}
