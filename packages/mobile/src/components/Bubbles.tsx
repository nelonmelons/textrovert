import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HedgehogAvatar } from '@/components/HedgehogAvatar';
import { radius, shadow, type, useTheme, type Tone } from '@/theme';

/** The user's own message: right-aligned, filled with the section ink, tail at the bottom right. */
export function MyBubble({ text, tone }: { text: string; tone?: Tone }) {
  const theme = useTheme();
  return (
    <View style={styles.mineRow}>
      <View style={[styles.mine, { backgroundColor: (tone ?? theme.tones.accent).ink }]}>
        <Text style={[type.body, { color: '#fff' }]}>{text}</Text>
      </View>
    </View>
  );
}

/** The assistant's turn: hedgehog avatar beside a paper panel with its tail at the top left. */
export function AssistantTurn({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const theme = useTheme();
  return (
    <View style={styles.theirsRow}>
      <HedgehogAvatar tone={tone} />
      <View style={[styles.theirs, shadow.soft, { backgroundColor: theme.panel }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  mineRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingLeft: 48 },
  mine: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: radius.bubble,
    borderTopRightRadius: radius.bubble,
    borderBottomLeftRadius: radius.bubble,
    borderBottomRightRadius: radius.bubbleTail,
  },
  theirsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingRight: 12 },
  theirs: {
    flex: 1,
    padding: 14,
    gap: 10,
    borderTopLeftRadius: radius.bubbleTail,
    borderTopRightRadius: radius.bubble,
    borderBottomLeftRadius: radius.bubble,
    borderBottomRightRadius: radius.bubble,
  },
});
