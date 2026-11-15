import { StyleSheet, Text, View } from 'react-native';

import { QuoteLine } from '@/components/QuoteLine';
import { senderLabel, type Citation } from '@/lib/api';
import { formatSent } from '@/lib/answer';
import { alpha, radius, type, useTheme } from '@/theme';

/** The cited messages behind an answer, tapped one first, each with sender, chat, date and the original text. */
export function Receipts({ citations, focus }: { citations: Citation[]; focus?: number }) {
  const theme = useTheme();
  const ordered = focus === undefined ? citations : [...citations.filter((c) => c.n === focus), ...citations.filter((c) => c.n !== focus)];
  return (
    <>
      <Text style={[type.footnote, { color: theme.secondary }]}>Original messages, word for word, from your imported chats.</Text>
      {ordered.map((c, i) => (
        <View key={c.n}>
          {focus !== undefined && i === 1 ? <Text style={[type.caption, styles.also, { color: theme.secondary }]}>ALSO IN THIS ANSWER</Text> : null}
          <View style={[styles.card, { backgroundColor: c.n === focus ? theme.ask.fill : theme.surface, borderColor: theme.gridMajor }]}>
            <QuoteLine who={senderLabel(c)} meta={formatSent(c.sentAt)} color={theme.ask.ink}>
              <Highlighted text={c.text} quote={c.quote} />
            </QuoteLine>
            <View style={styles.footer}>
              <Text style={[type.caption, styles.badge, { color: theme.ask.ink, backgroundColor: theme.ask.fill }]}>{' ' + c.n + ' '}</Text>
              <Text numberOfLines={1} style={[type.caption, { color: theme.secondary, flexShrink: 1 }]}>
                in {c.chat}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

/** The message with the quoted span the answer relies on washed in the Ask color, when it is a real excerpt. */
function Highlighted({ text, quote }: { text: string; quote: string }) {
  const theme = useTheme();
  const at = quote && quote.length < text.length * 0.8 ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1;
  if (at < 0) return <Text style={[type.callout, { color: theme.ink }]}>{text}</Text>;
  return (
    <Text style={[type.callout, { color: theme.ink }]}>
      {text.slice(0, at)}
      <Text style={{ backgroundColor: alpha(theme.ask.ink, 0.16) }}>{text.slice(at, at + quote.length)}</Text>
      {text.slice(at + quote.length)}
    </Text>
  );
}

const styles = StyleSheet.create({
  also: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginTop: 4 },
  card: { padding: 14, gap: 10, borderRadius: radius.tile, borderWidth: StyleSheet.hairlineWidth },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 13 },
  badge: { fontWeight: '800', borderRadius: 6, overflow: 'hidden' },
});
