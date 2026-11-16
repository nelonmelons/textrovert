import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { senderLabel, type Citation } from '@/api/client';
import { firstName } from '@/lib/answer';
import { radius, Theme, Type } from '@/theme';

const MAX_CHATS = 2;
const PHONE_MAX = 430;
/** Room the assistant bubble leaves for content: thread padding, avatar, gaps and the bubble's own padding. */
const BUBBLE_CHROME = 116;
const CHIP_GAP = 6;

/** Chip width estimate (caption, semibold), so each chat's chips can stop at one row without measuring. */
const chipWidth = (label: string) => 18 + [...label].length * 7;

/** Citations grouped by chat in order of first use: each chat named once, its messages as numbered sender chips. */
export function groupByChat(citations: Citation[]) {
  const groups = new Map<string, { chat: string; citations: Citation[] }>();
  for (const c of citations) {
    const g = groups.get(c.chatId) ?? { chat: c.chat, citations: [] };
    g.citations.push(c);
    groups.set(c.chatId, g);
  }
  return [...groups.values()];
}

/** The sources under an answer: up to two chats, one row of chips each, with "+N" for the rest. */
export function Sources({ citations, onOpen }: { citations: Citation[]; onOpen: (focus?: number) => void }) {
  const { width } = useWindowDimensions();
  const room = Math.min(width, PHONE_MAX) - BUBBLE_CHROME;
  const groups = groupByChat(citations);
  const shown = groups.slice(0, MAX_CHATS);
  const otherChats = groups.length - shown.length;
  const otherMessages = groups.slice(MAX_CHATS).reduce((n, g) => n + g.citations.length, 0);

  return (
    <View style={[styles.wrap, { borderTopColor: Theme.gridMajor }]}>
      <Pressable accessibilityRole="button" onPress={() => onOpen()} style={styles.header} hitSlop={6}>
        <Text style={[Type.caption, styles.label, { color: Theme.secondary }]}>
          {citations.length} {citations.length === 1 ? 'SOURCE' : 'SOURCES'}
        </Text>
        <Text style={[Type.caption, { color: Theme.accentTone.ink, fontWeight: '600' }]}>See all ›</Text>
      </Pressable>
      {shown.map((g) => {
        let used = 0;
        const fits = g.citations.filter((c, i) => {
          const rest = g.citations.length - i - 1;
          used += chipWidth(c.n + ' ' + firstName(senderLabel(c))) + CHIP_GAP;
          return used + (rest > 0 ? chipWidth('+' + rest) : 0) <= room;
        });
        const more = g.citations.length - fits.length;
        return (
          <View key={g.chat + g.citations[0].n} style={styles.group}>
            <Text numberOfLines={1} style={[Type.footnote, { color: Theme.ink, fontWeight: '600' }]}>
              {g.chat}
            </Text>
            <View style={styles.row}>
              {fits.map((c) => (
                <Pressable
                  key={c.n}
                  accessibilityRole="button"
                  aria-label={'Source ' + c.n + ': ' + senderLabel(c) + ' in ' + c.chat}
                  onPress={() => onOpen(c.n)}
                  style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? Theme.accentTone.ink : Theme.accentTone.fill }]}>
                  {({ pressed }) => (
                    <Text numberOfLines={1} style={[Type.caption, { color: pressed ? Theme.panel : Theme.accentTone.ink }]}>
                      <Text style={styles.n}>{c.n}</Text>
                      {'  ' + firstName(senderLabel(c))}
                    </Text>
                  )}
                </Pressable>
              ))}
              {more > 0 ? (
                <Pressable accessibilityRole="button" aria-label={more + ' more sources'} onPress={() => onOpen(g.citations[fits.length].n)} style={[styles.chip, { backgroundColor: Theme.tertiaryFill }]}>
                  <Text style={[Type.caption, { color: Theme.secondary, fontWeight: '600' }]}>+{more}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
      {otherChats > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => onOpen()} hitSlop={6}>
          <Text style={[Type.caption, { color: Theme.secondary }]}>
            +{otherMessages} more in {otherChats} other {otherChats === 1 ? 'chat' : 'chats'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingTop: 10, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: '700', letterSpacing: 0.6 },
  group: { gap: 5 },
  row: { flexDirection: 'row', gap: CHIP_GAP, overflow: 'hidden' },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.capsule, flexShrink: 0 },
  n: { fontWeight: '800', fontVariant: ['tabular-nums'] },
});
