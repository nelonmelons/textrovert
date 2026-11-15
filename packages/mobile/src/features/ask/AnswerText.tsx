import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Citation } from '@/lib/api';
import { parseAnswer } from '@/lib/answer';
import { type, useTheme } from '@/theme';

/** An assistant answer with its [n] markers drawn as small tappable receipts. */
export function AnswerText({ answer, citations, onCite }: { answer: string; citations: Citation[]; onCite: (n: number) => void }) {
  const theme = useTheme();
  const known = new Set(citations.map((c) => c.n));
  return (
    <View style={styles.blocks}>
      {parseAnswer(answer).map((block, i) => (
        <View key={i} style={block.bullet ? styles.bulletRow : undefined}>
          {block.bullet ? <Text style={[type.body, { color: theme.ask.ink }]}>•</Text> : null}
          <Text style={[type.body, styles.flex, { color: theme.ink }]}>
            {block.segments.map((s, j) =>
              s.kind === 'text' ? (
                <Text key={j} style={s.bold ? styles.bold : undefined}>
                  {s.text}
                </Text>
              ) : known.has(s.n) ? (
                <Fragment key={j}>
                  <Text
                    accessibilityRole="button"
                    aria-label={'Source ' + s.n}
                    onPress={() => onCite(s.n)}
                    style={[type.caption, styles.marker, { color: theme.ask.ink, backgroundColor: theme.ask.fill }]}>
                    {' ' + s.n + ' '}
                  </Text>
                  <Text style={type.caption}>{'\u2009'}</Text>
                </Fragment>
              ) : null,
            )}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  flex: { flexShrink: 1 },
  bold: { fontWeight: '600' },
  marker: { fontWeight: '800', borderRadius: 6, overflow: 'hidden' },
});
