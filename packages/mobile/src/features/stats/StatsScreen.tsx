import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Face, toneFor } from '@/components/Face';
import { FadeIn } from '@/components/FadeIn';
import { PaperScreen } from '@/components/PaperScreen';
import { haptics } from '@/lib/haptics';
import { readMessagesFile, textingStats, type MessagesFile, type TextingStats } from '@/lib/messagesFile';
import { brand, radius, shadow, type, useTheme } from '@/theme';

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

/** Stats: import the file the Textrovert Mac app saves, then see fun numbers from your whole iMessage history. */
export function StatsScreen() {
  const theme = useTheme();
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
    <PaperScreen title="Stats" subtitle={state.status === 'ready' ? 'From your Mac · ' + day(new Date(state.file.exportedAt * 1000)) : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        {state.status === 'ready' ? (
          <Ready stats={state.stats} onImport={importFile} onRemove={remove} />
        ) : (
          <FadeIn>
            <View style={[styles.card, styles.intro, shadow.soft, { backgroundColor: theme.panel, borderColor: theme.gridMajor }]}>
              <View style={[styles.artWrap, { backgroundColor: theme.tones.celebrate.fill }]}>
                <Image source={require('../../../assets/hedgehog-reader.png')} resizeMode="contain" style={styles.art} aria-hidden />
              </View>
              <Text accessibilityRole="header" style={[type.title2, { color: theme.ink }]}>
                Your texting stats
              </Text>
              <View style={styles.steps}>
                {['On your Mac, open Textrovert and click Save for iPhone.', 'AirDrop the file to this phone and save it to Files.', 'Tap Import and pick the file.'].map((step, i) => (
                  <View key={step} style={styles.step}>
                    <Text style={[type.footnote, styles.stepNumber, { color: theme.tones.celebrate.ink, backgroundColor: theme.tones.celebrate.fill }]}>{i + 1}</Text>
                    <Text style={[type.subheadline, styles.flex, { color: theme.ink }]}>{step}</Text>
                  </View>
                ))}
              </View>
              {state.status === 'reading' ? (
                <View style={styles.reading}>
                  <ActivityIndicator color={theme.tones.celebrate.ink} />
                  <Text style={[type.subheadline, { color: theme.secondary }]}>Reading your messages…</Text>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={importFile} style={({ pressed }) => [styles.button, { backgroundColor: theme.tones.celebrate.ink, opacity: pressed ? 0.8 : 1 }]}>
                  <Text style={[type.headline, { color: theme.panel }]}>Import messages file</Text>
                </Pressable>
              )}
              {state.status === 'error' ? <Text style={[type.footnote, styles.center, { color: brand.deadline }]}>{state.message}</Text> : null}
            </View>
          </FadeIn>
        )}
      </ScrollView>
    </PaperScreen>
  );
}

interface Tile {
  value: string;
  label: string;
}

function Ready({ stats, onImport, onRemove }: { stats: TextingStats; onImport: () => void; onRemove: () => void }) {
  const theme = useTheme();
  if (stats.messages === 0) {
    return <Text style={[type.subheadline, styles.center, { color: theme.secondary }]}>That file has no messages in it.</Text>;
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
    <View style={styles.ready}>
      <FadeIn>
        <View style={[styles.card, shadow.soft, { backgroundColor: theme.panel, borderColor: theme.gridMajor }]}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={[type.largeTitle, styles.total, { color: brand.magenta }]}>
            {count(stats.messages)}
          </Text>
          <Text style={[type.subheadline, { color: theme.secondary }]}>
            messages across {count(stats.chats)} {stats.chats === 1 ? 'chat' : 'chats'}
            {since}
          </Text>
        </View>
      </FadeIn>
      <View style={styles.tiles}>
        {tiles.map((tile, i) => (
          <FadeIn key={tile.label} delay={60 + i * 40} style={styles.tileWrap}>
            <View style={[styles.tile, { backgroundColor: theme.panel, borderColor: theme.gridMajor }]}>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[type.title2, { color: theme.tones.celebrate.ink }]}>
                {tile.value}
              </Text>
              <Text style={[type.footnote, { color: theme.secondary }]}>{tile.label}</Text>
            </View>
          </FadeIn>
        ))}
      </View>
      {stats.people.length > 0 ? (
        <View>
          <Text style={[type.caption, styles.section, { color: theme.secondary }]}>YOUR TOP PEOPLE</Text>
          {stats.people.map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.row,
                { backgroundColor: theme.panel, borderColor: theme.gridMajor },
                i === 0 && styles.top,
                i === stats.people.length - 1 ? styles.bottom : { borderBottomWidth: StyleSheet.hairlineWidth },
              ]}>
              <Face name={p.name} size={38} tone={toneFor(p.name, theme.tones)} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[type.headline, { color: theme.ink }]}>
                  {p.name}
                </Text>
                <Text numberOfLines={1} style={[type.footnote, { color: theme.secondary }]}>
                  {percent(p.fromYou / p.messages)} from you
                  {p.streak >= 2 ? ' · ' + p.streak + '-day streak' : ''} · since {new Date(p.since * 1000).getFullYear()}
                </Text>
              </View>
              <Text style={[type.headline, { color: theme.tones.celebrate.ink }]}>{count(p.messages)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onImport} hitSlop={8}>
          <Text style={[type.subheadline, { color: theme.tones.celebrate.ink, fontWeight: '600' }]}>Import a newer file</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRemove} hitSlop={8}>
          <Text style={[type.subheadline, { color: brand.deadline, fontWeight: '600' }]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  card: { padding: 20, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth },
  intro: { alignItems: 'center', gap: 12 },
  artWrap: { width: 148, height: 148, borderRadius: 74, alignItems: 'center', justifyContent: 'center' },
  art: { width: 124, height: 104 },
  steps: { alignSelf: 'stretch', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNumber: { width: 22, height: 22, lineHeight: 22, borderRadius: 11, overflow: 'hidden', textAlign: 'center', fontWeight: '800' },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  button: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 13, borderRadius: radius.capsule },
  center: { textAlign: 'center' },
  ready: { gap: 16 },
  total: { fontSize: 52, lineHeight: 60 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileWrap: { width: '48%', flexGrow: 1 },
  tile: { flex: 1, gap: 4, padding: 14, borderRadius: radius.tile, borderWidth: StyleSheet.hairlineWidth },
  section: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  top: { borderTopLeftRadius: radius.tile, borderTopRightRadius: radius.tile, borderTopWidth: StyleSheet.hairlineWidth },
  bottom: { borderBottomLeftRadius: radius.tile, borderBottomRightRadius: radius.tile, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
});
