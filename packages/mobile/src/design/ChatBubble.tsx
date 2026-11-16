import { useEffect, useState, type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Glass } from './Backdrop';
import { type EmojiAvatarProps } from './EmojiAvatar';
import { fonts } from './fonts';
import { Avatar, Bubble } from './Kit';
import { ditto, durations, radii, softShadow, space } from './tokens';

/** A chat panel: house glass the bubbles sit on. */
export function ChatPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass tone="dark" radius={radii.xl} style={[{ padding: space.md, gap: 2 }, style]}>
      {children}
    </Glass>
  );
}

/**
 * A Messages bubble (see Kit's Bubble): received grey with black ink, sent blue. The sender's name sits above a received
 * bubble and the time under it, small and white, the way the hero phone labels its thread. highlighted rings it pink.
 */
export function ChatBubble({ text, mine = false, name, time, highlighted = false, children }: { text?: string; mine?: boolean; name?: string; time?: string; highlighted?: boolean; children?: ReactNode }) {
  const label = { fontFamily: fonts.sf, fontSize: 11, lineHeight: 14, color: 'rgba(255, 255, 255, 0.8)', fontWeight: '500' as const };
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%', marginTop: 6, gap: 2 }}>
      {name && !mine ? <Text style={[label, softShadow, { marginLeft: 17 }]}>{name}</Text> : null}
      <Bubble text={text} mine={mine} maxWidth="100%" style={highlighted ? { borderRadius: radii.bubble, borderWidth: 2, borderColor: ditto.primary } : undefined}>
        {children}
      </Bubble>
      {time ? <Text style={[label, softShadow, { alignSelf: mine ? 'flex-end' : 'flex-start', marginHorizontal: 17, opacity: 0.85 }]}>{time}</Text> : null}
    </View>
  );
}

/**
 * Sweeps a thin white line with an avatar riding on it down over its children, back and forth, like reading the chat.
 * Reduce Motion parks the line at rest.
 */
export function ScanHighlight({ children, avatar, rest = 0.5 }: { children: ReactNode; avatar: EmojiAvatarProps; rest?: number }) {
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const t = useSharedValue(rest);
  useEffect(() => {
    if (reduced || !height) {
      t.value = rest;
      return;
    }
    t.value = 0.08;
    t.value = withRepeat(withTiming(0.92, { duration: durations.scan, easing: Easing.inOut(Easing.cubic) }), -1, true);
  }, [reduced, height, rest, t]);
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * height }] }));
  return (
    <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {children}
      {height ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -space.lg, right: -space.lg, top: -22, height: 44, justifyContent: 'center', alignItems: 'center' }, line]}>
          <View style={{ position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(255, 255, 255, 0.9)' }} />
          <Avatar name={avatar.name} image={avatar.image} size={40} />
        </Animated.View>
      ) : null}
    </View>
  );
}
