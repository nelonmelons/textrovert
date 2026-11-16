import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { initials } from '@/api/people';
import { Divider, Face, SectionCard, ToneTab } from '@/components/Paper';
import { PaperScroll } from '@/components/PaperScroll';
import { FadeIn } from '@/components/FadeIn';
import { haptics } from '@/lib/haptics';
import { readMessagesFile, textingStats, type MessagesFile, type TextingStats } from '@/lib/messagesFile';
import { radius, Rounded, Theme, Type, withAlpha } from '@/theme';

type State =
  | { status: 'empty' }
  | { status: 'reading' }
  | { status: 'ready'; file: MessagesFile; stats: TextingStats }
  | { status: 'error'; message: string };

/** On a phone the imported file stays in the app's documents, so the stats survive a relaunch. */
const savedCopy = () => (Platform.OS === 'web' ? null : new File(Paths.document, 'imported-messages.textrovert'));

function load(json: string): State {
  const file = readMessagesFile(json);
  return { status: 'ready', file, stats: textingStats(file) };
}

const count = (n: number) => n.toLocaleString();
const percent = (share: number) => Math.round(share * 100) + '%';
const hour = (h: number) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
const day = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const tone = Theme.celebrateTone;

/** Stats: import the file the Textrovert Mac app saves, then see fun numbers from your whole iMessage history. */
export function StatsScreen() {
  const [state, setState] = useState<State>({ status: 'empty' });

  useEffect(() => {
    const copy = savedCopy();
    if (!copy?.exists) return;
    setState({ status: 'reading' });
    copy
      .text()
      .then((json) => setState(load(json)))
      .catch(() => setState({ status: 'empty' }));
  }, []);

  const importFile = async () => {
    haptics.select();
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled) return;
    setState({ status: 'reading' });
    try {
      const asset = picked.assets[0];
      const json = asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const next = load(json);
      await savedCopy()?.write(json);
      setState(next);
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const remove = () => {
    haptics.select();
    const copy = savedCopy();
    if (copy?.exists) copy.delete();
    setState({ status: 'empty' });
  };

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Your texting stats', headerTitleStyle: { color: Theme.ink, fontWeight: '600' } }} />
      <PaperScroll contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 18 }}>
        {state.status === 'ready' ? (
          <Ready file={state.file} stats={state.stats} onImport={importFile} onRemove={remove} />
        ) : (
          <FadeIn>
            <SectionCard tone={tone}>
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <ToneTab title="Your iMessage stats" symbol="chart.bar.fill" tone={tone} />
                  <Image source={require('../../../assets/art/hedgehog-reader.png')} resizeMode="contain" style={{ width: 70, height: 80 }} aria-hidden />
                </View>
                <Text style={[Type.subheadline, { color: Theme.ink }]}>See your real texting stats, counted on this phone. Nothing is uploaded.</Text>
                <View style={{ gap: 10 }}>
                  {['On your Mac, open Textrovert and click Save for iPhone.', 'AirDrop the file here, or save it to Files.', 'Tap Import and pick the file.'].map((step, i) => (
                    <View key={step} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Text style={[Type.footnote, styles.stepNumber]}>{i + 1}</Text>
                      <Text style={[Type.subheadline, { flex: 1, color: Theme.ink }]}>{step}</Text>
                    </View>
                  ))}
                </View>
                {state.status === 'reading' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                    <ActivityIndicator color={tone.ink} />
                    <Text style={[Type.subheadline, { color: Theme.secondary }]}>Reading your messages…</Text>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" onPress={importFile} style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
                    <Text style={[Type.headline, { color: '#FFFFFF', fontFamily: Rounded.bold }]}>Import messages file</Text>
                  </Pressable>
                )}
                {state.status === 'error' ? <Text style={[Type.footnote, { color: Theme.deadline }]}>{state.message}</Text> : null}
              </View>
            </SectionCard>
          </FadeIn>
        )}
      </PaperScroll>
    </>
  );
}

interface Tile {
  value: string;
  label: string;
}

function Ready({ file, stats, onImport, onRemove }: { file: MessagesFile; stats: TextingStats; onImport: () => void; onRemove: () => void }) {
  if (stats.messages === 0) {
    return <Text style={[Type.subheadline, { color: Theme.secondary, textAlign: 'center' }]}>That file has no messages in it.</Text>;
  }
  const since = stats.since ? ' since ' + new Date(stats.since * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
  const [topEmoji] = stats.topEmoji;
  const tiles = [
    { value: percent(stats.sent / stats.messages), label: 'of them are from you' },
    stats.busiestHour !== undefined && { value: hour(stats.busiestHour), label: 'is when you text the most' },
    stats.biggestDay && { value: count(stats.biggestDay.messages), label: 'messages on ' + day(stats.biggestDay.date) + ', your biggest day, mostly with ' + stats.biggestDay.mostlyWith },
    stats.longestStreak && { value: stats.longestStreak.days + ' days', label: 'in a row texting ' + stats.longestStreak.name },
    topEmoji && { value: stats.topEmoji.map((e) => e.emoji).join(' '), label: 'your top emoji, with ' + topEmoji.emoji + ' sent ' + count(topEmoji.count) + ' times' },
    stats.laughs > 0 && { value: count(stats.laughs), label: 'times you laughed: lol, haha, 😂' },
    stats.sent > 0 && { value: percent(stats.lateNight), label: 'of your texts go out after midnight' },
    stats.loudestGroup && { value: count(stats.loudestGroup.messages), label: 'messages in ' + stats.loudestGroup.name + ', your loudest group chat' },
  ].filter((tile): tile is Tile => !!tile);

  return (
    <>
      <FadeIn>
        <SectionCard tone={tone} fillOpacity={0.55}>
          <View style={{ gap: 4 }}>
            <ToneTab title="Your iMessage stats" symbol="chart.bar.fill" tone={tone} style={{ marginBottom: 8 }} />
            <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.total, { fontFamily: Rounded.heavy }]}>
              {count(stats.messages)}
            </Text>
            <Text style={[Type.subheadline, { color: Theme.secondary }]}>
              messages across {count(stats.chats)} {stats.chats === 1 ? 'chat' : 'chats'}
              {since}
            </Text>
          </View>
        </SectionCard>
      </FadeIn>
      <View style={styles.tiles}>
        {tiles.map((tile, i) => (
          <FadeIn key={tile.label} delay={60 + i * 40} style={styles.tileWrap}>
            <View style={styles.tile}>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[Type.title2, { color: tone.ink, fontFamily: Rounded.bold }]}>
                {tile.value}
              </Text>
              <Text style={[Type.footnote, { color: Theme.secondary }]}>{tile.label}</Text>
            </View>
          </FadeIn>
        ))}
      </View>
      {stats.people.length > 0 ? (
        <SectionCard tone={Theme.accentTone}>
          <View style={{ gap: 12 }}>
            <ToneTab title="Your top people" symbol="person.2.fill" tone={Theme.accentTone} />
            {stats.people.map((p, i) => (
              <View key={p.id} style={{ gap: 12 }}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Face initials={initials(p.name)} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={1} style={[Type.headline, { color: Theme.ink }]}>
                      {p.name}
                    </Text>
                    <Text numberOfLines={1} style={[Type.footnote, { color: Theme.secondary }]}>
                      {percent(p.fromYou / p.messages)} from you
                      {p.streak >= 2 ? ' · ' + p.streak + '-day streak' : ''} · since {new Date(p.since * 1000).getFullYear()}
                    </Text>
                  </View>
                  <Text style={[Type.headline, { color: Theme.accentTone.ink }]}>{count(p.messages)}</Text>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}
      <Text style={[Type.caption, { color: Theme.secondary }]}>From your Mac · saved {day(new Date(file.exportedAt * 1000))}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Pressable accessibilityRole="button" onPress={onImport} hitSlop={8}>
          <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Import a newer file</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRemove} hitSlop={8}>
          <Text style={[Type.subheadline, { color: Theme.deadline, fontWeight: '600' }]}>Remove</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stepNumber: { width: 22, height: 22, lineHeight: 22, borderRadius: 11, overflow: 'hidden', textAlign: 'center', fontWeight: '800', color: tone.ink, backgroundColor: tone.fill },
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: radius.capsule, backgroundColor: Theme.accent },
  total: { fontSize: 52, lineHeight: 60, color: Theme.accent },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileWrap: { width: '48%', flexGrow: 1 },
  tile: { flex: 1, gap: 4, padding: 14, borderRadius: radius.tile, backgroundColor: withAlpha(Theme.panel, 0.92), borderWidth: StyleSheet.hairlineWidth, borderColor: Theme.gridMajor },
});
