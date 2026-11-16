import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FadeIn } from '@/components/FadeIn';
import { senderLabel, type Citation } from '@/lib/api';
import { formatSent } from '@/lib/answer';
import { alpha, radius, type, useTheme } from '@/theme';

const CLAMP_LINES = 6;
/** Messages past this length or line count clamp to CLAMP_LINES with a "Show full message" toggle. */
const LONG_CHARS = 280;
const LONG_LINES = 6;
/** When the quote sits deep in a long message, the clamped view starts this many characters before it. */
const LEAD_IN = 60;

/** The cited messages behind an answer, tapped one first, each with sender, chat, date and the original text. */
export function Receipts({ citations, focus }: { citations: Citation[]; focus?: number }) {
  const theme = useTheme();
  const ordered = focus === undefined ? citations : [...citations.filter((c) => c.n === focus), ...citations.filter((c) => c.n !== focus)];
  return (
    <>
      <Text style={[type.footnote, { color: theme.secondary }]}>Original messages, word for word, from your imported chats.</Text>
      {ordered.map((c, i) => (
        <FadeIn key={c.n} delay={Math.min(i, 4) * 50}>
          {focus !== undefined && i === 1 ? <Text style={[type.caption, styles.also, { color: theme.secondary }]}>ALSO IN THIS ANSWER</Text> : null}
          <Receipt citation={c} focused={c.n === focus} />
        </FadeIn>
      ))}
    </>
  );
}

function Receipt({ citation: c, focused }: { citation: Citation; focused: boolean }) {
  const theme = useTheme();
  const [full, setFull] = useState(false);
  const long = c.text.length > LONG_CHARS || c.text.split('\n').length > LONG_LINES;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: focused ? theme.ask.ink : theme.gridMajor, borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: focused ? theme.ask.ink : theme.ask.fill }]}>
          <Text style={[styles.badgeText, { color: focused ? theme.panel : theme.ask.ink }]}>{c.n}</Text>
        </View>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[type.subheadline, { color: theme.ink, fontWeight: '600' }]}>
            {senderLabel(c)}
            <Text style={[type.caption, { color: theme.secondary, fontWeight: '400' }]}>{'  ' + formatSent(c.sentAt)}</Text>
          </Text>
          <Text numberOfLines={1} style={[type.caption, { color: theme.secondary }]}>
            in {c.chat}
          </Text>
        </View>
      </View>
      <View style={[styles.quote, { borderLeftColor: theme.ask.ink }]}>
        <Excerpt text={c.text} quote={c.quote} full={full || !long} />
      </View>
      {long ? (
        <Pressable accessibilityRole="button" onPress={() => setFull((f) => !f)} hitSlop={8} style={styles.toggle}>
          <Text style={[type.footnote, { color: theme.ask.ink, fontWeight: '600' }]}>{full ? 'Show less' : 'Show full message'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Where the quote sits in the message, ignoring case; -1 when it is missing or is (nearly) the whole message. */
function findQuote(text: string, quote: string) {
  const q = quote.trim();
  if (!q || q.length >= text.trim().length * 0.9) return -1;
  return text.toLowerCase().indexOf(q.toLowerCase());
}

/** The message with only the quoted span washed in the Ask color; clamped, it opens a little before the quote. */
function Excerpt({ text, quote, full }: { text: string; quote: string; full: boolean }) {
  const theme = useTheme();
  const at = findQuote(text, quote);
  const q = quote.trim();
  let start = 0;
  if (!full && at > LEAD_IN * 2) {
    const space = text.indexOf(' ', at - LEAD_IN);
    start = space > 0 && space < at ? space + 1 : at;
  }
  const style = [styles.message, { color: theme.ink }];
  const lines = full ? undefined : CLAMP_LINES;
  if (at < 0) return <Text numberOfLines={lines} style={style}>{text}</Text>;
  return (
    <Text numberOfLines={lines} style={style}>
      {start > 0 ? '…' : ''}
      {text.slice(start, at)}
      <Text style={{ backgroundColor: alpha(theme.ask.ink, theme.scheme === 'dark' ? 0.32 : 0.18), fontWeight: '500' }}>{text.slice(at, at + q.length)}</Text>
      {text.slice(at + q.length)}
    </Text>
  );
}

const styles = StyleSheet.create({
  also: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginTop: 4 },
  card: { padding: 14, gap: 10, borderRadius: radius.tile },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  quote: { borderLeftWidth: 3, paddingLeft: 11 },
  message: { fontFamily: type.callout.fontFamily, fontSize: 15, lineHeight: 21 },
  toggle: { alignSelf: 'flex-start' },
});
