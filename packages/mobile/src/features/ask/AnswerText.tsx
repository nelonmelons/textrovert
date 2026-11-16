import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, Txt, useDesign } from '@/design';
import { blockLength, parseAnswer, type Block, type Segment } from '@/lib/answer';

/** Answers longer than this many characters fold after the block that crosses it, behind "Show more". */
const FOLD_AT = 360;
const FOLD_MIN_HIDDEN = 160;

/** An assistant answer as light markdown in a grey Messages bubble (black SF), its [n] markers as small raised pink pills that open the receipt. */
export function AnswerText({ answer, known, onCite }: { answer: string; known: Set<number>; onCite: (n: number) => void }) {
  const { c } = useDesign();
  const [expanded, setExpanded] = useState(false);
  const blocks = parseAnswer(answer);
  const total = blocks.reduce((n, b) => n + blockLength(b), 0);
  let fold = blocks.length;
  if (total > FOLD_AT + FOLD_MIN_HIDDEN) {
    let seen = 0;
    fold = blocks.findIndex((b) => (seen += blockLength(b)) > FOLD_AT) + 1;
  }
  const shown = expanded ? blocks : blocks.slice(0, fold);
  const hidden = blocks.length - shown.length;

  const line = (segments: Segment[], style?: object) => (
    <Text style={[styles.text, { color: c.bubbleText }, style]}>
      {segments.map((s, j) =>
        s.kind === 'text' ? (
          <Text key={j} style={s.bold ? styles.bold : undefined}>
            {s.text}
          </Text>
        ) : (
          <Text key={j}>
            {'\u2009'}
            {s.ns.filter((n) => known.has(n)).map((n) => (
              <Cite key={n} n={n} onPress={() => onCite(n)} />
            ))}
          </Text>
        ),
      )}
    </Text>
  );

  const render = (b: Block, i: number) => {
    if (b.kind === 'heading') return <View key={i}>{line(b.segments, styles.heading)}</View>;
    if (b.kind === 'paragraph') return <View key={i}>{line(b.segments)}</View>;
    return (
      <View key={i} style={styles.item}>
        <Text style={[styles.text, styles.marker, { color: c.accentText }, b.kind === 'number' ? styles.number : null]}>{b.kind === 'number' ? b.label : '•'}</Text>
        <View style={styles.flex}>{line(b.segments)}</View>
      </View>
    );
  };

  return (
    <View style={styles.blocks}>
      {shown.map(render)}
      {hidden > 0 || expanded ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((e) => !e)} hitSlop={8} style={styles.more}>
          <Txt variant="footnote" color="rgba(0, 0, 0, 0.55)" style={{ fontWeight: '600', textDecorationLine: 'underline' }}>
            {expanded ? 'Show less ▲' : 'Show more ▼'}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A citation number in a small raised pill, inline with the sentence it supports. */
function Cite({ n, onPress }: { n: number; onPress: () => void }) {
  const { c } = useDesign();
  return (
    <View style={styles.raise}>
      <Pressable
        accessibilityRole="button"
        aria-label={'Source ' + n}
        onPress={onPress}
        hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
        style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? c.key : c.accent }]}>
        {({ pressed }) => <Text style={[styles.pillText, { color: pressed ? c.keyInk : c.onAccent }]}>{n}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: 7 },
  text: { fontFamily: fonts.sf, fontSize: 17, lineHeight: 22, letterSpacing: -0.43 },
  heading: { fontFamily: fonts.sf, fontWeight: '600', fontSize: 17, marginTop: 4 },
  bold: { fontFamily: fonts.sf, fontWeight: '600' },
  item: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  marker: { width: 10, textAlign: 'center', fontFamily: fonts.sf, fontWeight: '600' },
  number: { width: 18, textAlign: 'right', fontVariant: ['tabular-nums'], fontSize: 15 },
  flex: { flex: 1 },
  raise: { transform: [{ translateY: Platform.OS === 'web' ? -5 : -4 }], marginRight: 2 },
  pill: { minWidth: 17, height: 17, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: fonts.sf, fontWeight: '700', fontSize: 10, lineHeight: 12, fontVariant: ['tabular-nums'] },
  more: { alignSelf: 'flex-start', paddingTop: 2 },
});
