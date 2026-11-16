import { useState } from 'react';
import { Pressable, Share, Platform, Switch, Text, View } from 'react-native';

import { buildShareText, isModelSuggestion, type WrappedEdition, type WrappedHighlight, type WrappedParticipant } from '@textrovert/wrapped';

import { useTheme, type } from '@/theme';

import { stamp, type Story } from './parts';

/** Every message a card shows, with its id, and why the card was picked. */
export function SourcesSheet({ highlight, story }: { highlight: WrappedHighlight; story: Story }) {
  const theme = useTheme();
  const quotes = highlight.quotes.map((q) => q.quote).sort((a, b) => a.sentAt - b.sentAt);
  const n = highlight.sourceMessageIDs.length;
  return (
    <View testID="wrappedSourceSheet" style={{ gap: 18 }}>
      <Text style={[type.footnote, { color: theme.secondary, textTransform: 'uppercase' }]}>Messages shown</Text>
      {quotes.map((q) => (
        <View key={q.messageID} accessible style={{ gap: 4 }}>
          <Text style={[type.body, { color: theme.ink }]}>“{q.text}”</Text>
          <Text style={[type.caption, { color: theme.secondary }]}>{q.speakerName} · {stamp(story, q.sentAt)} · {q.service}</Text>
          <Text style={[type.caption2, { color: theme.secondary, fontFamily: Platform.select({ ios: 'Menlo', web: 'ui-monospace, Menlo, monospace', default: 'monospace' }) }]}>Message {q.messageID}</Text>
        </View>
      ))}
      <Text style={[type.footnote, { color: theme.secondary, textTransform: 'uppercase', marginTop: 6 }]}>Why this moment</Text>
      {isModelSuggestion(highlight) ? (
        <Text testID="wrappedModelNote" style={[type.footnote, { color: theme.ink }]}>
          The Textrovert server’s model pointed me to these messages. I checked every quote above against the original message before showing it.
        </Text>
      ) : null}
      {highlight.why ? <Text style={[type.body, { color: theme.ink }]}>{highlight.why}</Text> : null}
      <Text style={[type.footnote, { color: theme.secondary }]}>I counted {n} source message{n === 1 ? '' : 's'}.</Text>
    </View>
  );
}

/** Hands exactly the previewed text to the system share sheet; on web without one, copies it. */
async function shareText(message: string): Promise<string | null> {
  try {
    await Share.share({ message });
    return null;
  } catch {
    const clipboard = Platform.OS === 'web' ? (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator?.clipboard : undefined;
    if (!clipboard) return 'Sharing isn’t available here.';
    await clipboard.writeText(message);
    return 'Copied. This browser has no share sheet.';
  }
}

/** One toggle per card (the ghost card starts off) and the literal text that would be shared. */
export function SharePreview({ edition, owner, friend, locale, onDone }: { edition: WrappedEdition; owner: WrappedParticipant; friend: WrappedParticipant; locale: string; onDone: () => void }) {
  const theme = useTheme();
  const [selected, setSelected] = useState(() => new Set(edition.highlights.filter((h) => h.shareByDefault).map((h) => h.id)));
  const [note, setNote] = useState<string | null>(null);
  const preview = buildShareText(edition, selected, owner, friend, locale);
  const toggle = (id: string, on: boolean) => setSelected((s) => {
    const next = new Set(s);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });
  return (
    <View style={{ gap: 16 }}>
      <Text style={[type.footnote, { color: theme.secondary, textTransform: 'uppercase' }]}>Choose cards</Text>
      {edition.highlights.map((h) => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: theme.ink }]}>{h.headline}</Text>
            {!h.shareByDefault ? <Text style={[type.caption, { color: theme.secondary }]}>Private by default</Text> : null}
          </View>
          <Switch testID={`wrappedShareToggle-${h.signal}`} accessibilityLabel={`Share ${h.headline}`} value={selected.has(h.id)} onValueChange={(on) => toggle(h.id, on)} />
        </View>
      ))}
      <Text style={[type.footnote, { color: theme.secondary, textTransform: 'uppercase', marginTop: 6 }]}>Exactly what would be shared</Text>
      <Text testID="wrappedSharePreviewText" selectable style={[type.callout, { color: theme.ink, backgroundColor: theme.fillTertiary, padding: 12, borderRadius: 12 }]}>
        {preview}
      </Text>
      <Text style={[type.footnote, { color: theme.secondary }]}>Nothing is shared until you choose Share.</Text>
      {note ? <Text style={[type.footnote, { color: theme.ink }]}>{note}</Text> : null}
      <Pressable
        testID="wrappedShareSend"
        accessibilityRole="button"
        accessibilityState={{ disabled: selected.size === 0 }}
        disabled={selected.size === 0}
        onPress={async () => {
          const result = await shareText(preview);
          if (result) setNote(result);
          else onDone();
        }}
        style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: 999, backgroundColor: theme.ask.ink, opacity: selected.size === 0 ? 0.4 : pressed ? 0.8 : 1 })}>
        <Text style={[type.headline, { color: theme.panel }]}>Share…</Text>
      </Pressable>
    </View>
  );
}

/** The edition picker behind "Earlier editions". */
export function EditionList({ editions, current, onSelect }: { editions: WrappedEdition[]; current: number; onSelect: (index: number) => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {editions.map((e, i) => (
        <Pressable key={e.id} testID={`wrappedEdition-${i + 1}`} accessibilityRole="button" accessibilityState={{ selected: i === current }} onPress={() => onSelect(i)} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={[type.body, { color: theme.ink, fontWeight: i === current ? '700' : '400' }]}>Edition {i + 1}</Text>
          <Text style={[type.caption, { color: theme.secondary }]} numberOfLines={1}>{e.highlights.map((h) => h.headline).join(' · ')}</Text>
        </Pressable>
      ))}
    </View>
  );
}
