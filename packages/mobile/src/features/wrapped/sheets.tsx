import { useState } from 'react';
import { Pressable, Share, Platform, Switch, Text, View } from 'react-native';

import { buildShareText, isModelSuggestion, type WrappedEdition, type WrappedHighlight, type WrappedParticipant } from '@textrovert/wrapped';

import { Theme, Type } from '@/theme';

import { stamp, type Story } from './parts';

/** Every message a card shows, with its id, and why the card was picked. */
export function SourcesSheet({ highlight, story }: { highlight: WrappedHighlight; story: Story }) {
  const quotes = highlight.quotes.map((q) => q.quote).sort((a, b) => a.sentAt - b.sentAt);
  const n = highlight.sourceMessageIDs.length;
  return (
    <View testID="wrappedSourceSheet" style={{ gap: 18 }}>
      <Text style={[Type.footnote, { color: Theme.secondary, textTransform: 'uppercase' }]}>Messages shown</Text>
      {quotes.map((q) => (
        <View key={q.messageID} accessible style={{ gap: 4 }}>
          <Text style={[Type.body, { color: Theme.ink }]}>“{q.text}”</Text>
          <Text style={[Type.caption, { color: Theme.secondary }]}>{q.speakerName} · {stamp(story, q.sentAt)} · {q.service}</Text>
          <Text style={[Type.caption2, { color: Theme.secondary, fontFamily: Platform.select({ ios: 'Menlo', web: 'ui-monospace, Menlo, monospace', default: 'monospace' }) }]}>Message {q.messageID}</Text>
        </View>
      ))}
      <Text style={[Type.footnote, { color: Theme.secondary, textTransform: 'uppercase', marginTop: 6 }]}>Why this moment</Text>
      {isModelSuggestion(highlight) ? (
        <Text testID="wrappedModelNote" style={[Type.footnote, { color: Theme.ink }]}>
          The Textrovert server’s model pointed me to these messages. I checked every quote above against the original message before showing it.
        </Text>
      ) : null}
      {highlight.why ? <Text style={[Type.body, { color: Theme.ink }]}>{highlight.why}</Text> : null}
      <Text style={[Type.footnote, { color: Theme.secondary }]}>I counted {n} source message{n === 1 ? '' : 's'}.</Text>
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
      <Text style={[Type.footnote, { color: Theme.secondary, textTransform: 'uppercase' }]}>Choose cards</Text>
      {edition.highlights.map((h) => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <View style={{ flex: 1 }}>
            <Text style={[Type.body, { color: Theme.ink }]}>{h.headline}</Text>
            {!h.shareByDefault ? <Text style={[Type.caption, { color: Theme.secondary }]}>Private by default</Text> : null}
          </View>
          <Switch testID={`wrappedShareToggle-${h.signal}`} accessibilityLabel={`Share ${h.headline}`} value={selected.has(h.id)} onValueChange={(on) => toggle(h.id, on)} />
        </View>
      ))}
      <Text style={[Type.footnote, { color: Theme.secondary, textTransform: 'uppercase', marginTop: 6 }]}>Exactly what would be shared</Text>
      <Text testID="wrappedSharePreviewText" selectable style={[Type.callout, { color: Theme.ink, backgroundColor: Theme.tertiaryFill, padding: 12, borderRadius: 12 }]}>
        {preview}
      </Text>
      <Text style={[Type.footnote, { color: Theme.secondary }]}>Nothing is shared until you choose Share.</Text>
      {note ? <Text style={[Type.footnote, { color: Theme.ink }]}>{note}</Text> : null}
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
        style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: 999, backgroundColor: Theme.accent, opacity: selected.size === 0 ? 0.4 : pressed ? 0.8 : 1 })}>
        <Text style={[Type.headline, { color: Theme.panel }]}>Share…</Text>
      </Pressable>
    </View>
  );
}

/** The edition picker behind "Earlier editions". */
export function EditionList({ editions, current, onSelect }: { editions: WrappedEdition[]; current: number; onSelect: (index: number) => void }) {
  return (
    <View style={{ gap: 4 }}>
      {editions.map((e, i) => (
        <Pressable key={e.id} testID={`wrappedEdition-${i + 1}`} accessibilityRole="button" accessibilityState={{ selected: i === current }} onPress={() => onSelect(i)} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={[Type.body, { color: Theme.ink, fontWeight: i === current ? '700' : '400' }]}>Edition {i + 1}</Text>
          <Text style={[Type.caption, { color: Theme.secondary }]} numberOfLines={1}>{e.highlights.map((h) => h.headline).join(' · ')}</Text>
        </Pressable>
      ))}
    </View>
  );
}
