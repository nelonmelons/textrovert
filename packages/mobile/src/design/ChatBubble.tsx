import { useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Glass } from './Backdrop';
import { EmojiAvatar, type EmojiAvatarProps } from './EmojiAvatar';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { durations, radii, space, withAlpha } from './tokens';

/** A chat panel: the navy glass the bubbles sit on. */
export function ChatPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass tone="dark" radius={radii.xxl} style={[{ padding: space.lg, gap: space.sm }, style]}>
      {children}
    </Glass>
  );
}

/**
 * A message bubble. Theirs is white glass with the sender's name in pink; mine is Ditto's white key with navy ink.
 * Time sits bottom-right. highlighted rings it in pink with a glow, for messages the scan line picked out.
 */
export function ChatBubble({ text, mine = false, name, time, highlighted = false, children }: { text?: string; mine?: boolean; name?: string; time?: string; highlighted?: boolean; children?: ReactNode }) {
  const { c, shadow } = useDesign();
  const tail = radii.bubbleTail;
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        backgroundColor: mine ? c.bubbleMine : c.bubbleTheirs,
        borderTopWidth: mine ? 0 : 0.5,
        borderRadius: radii.bubble,
        borderBottomRightRadius: mine ? tail : radii.bubble,
        borderBottomLeftRadius: mine ? radii.bubble : tail,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 6,
        borderWidth: highlighted ? 2 : mine ? 0 : 0.5,
        borderColor: highlighted ? c.accent : 'rgba(255, 255, 255, 0.22)',
        boxShadow: highlighted ? shadow.glow : shadow.bubble,
      }}>
      {name && !mine ? (
        <Txt variant="footnote" color={c.bubbleName} style={{ fontWeight: '600' }}>
          {name}
        </Txt>
      ) : null}
      {text ? (
        <Txt variant="callout" color={mine ? c.bubbleMineText : c.bubbleText}>
          {text}
        </Txt>
      ) : null}
      {children}
      {time ? (
        <Txt variant="caption" color={mine ? c.bubbleMineTime : c.bubbleTime} style={{ alignSelf: 'flex-end', fontSize: 11, marginTop: 1, fontWeight: '400', letterSpacing: 0 }}>
          {time}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * Sweeps a glowing line with an avatar riding on it down over its children, back and forth, like reading the chat.
 * Reduce Motion parks the line at rest instead of animating.
 */
export function ScanHighlight({ children, avatar, rest = 0.5 }: { children: ReactNode; avatar: EmojiAvatarProps; rest?: number }) {
  const { c } = useDesign();
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
          <View style={{ position: 'absolute', left: 0, right: 0, height: 28, backgroundColor: withAlpha('#FF2CAB', 0.12) }} />
          <View style={{ position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: c.accent, boxShadow: '0px 0px 12px rgba(255, 44, 171, 0.9)' }} />
          <View style={{ borderRadius: 24, borderWidth: 3, borderColor: '#FFFFFF', boxShadow: '0px 0px 24px rgba(255, 44, 171, 0.7)' }}>
            <EmojiAvatar size={40} {...avatar} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
