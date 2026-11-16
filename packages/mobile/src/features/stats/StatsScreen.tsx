import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { BigButton, DesignFonts, EmojiAvatar, LargeTitle, ListRow, ListSection, PillButton, Screen, space, StatCard, Txt, useDesign, type FillName } from '@/design';
import { FadeIn } from '@/components/FadeIn';
import { haptics } from '@/lib/haptics';
import { readMessagesFile, textingStats, type MessagesFile, type TextingStats } from '@/lib/messagesFile';

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

  const { c } = useDesign();
  const art = state.status === 'reading' ? SLEEPY : state.status === 'ready' ? CHART : WAVE;
  return (
    <DesignFonts>
      <Stack.Screen options={{ headerTitle: '', headerStyle: { backgroundColor: c.background }, headerTintColor: c.accentText }} />
      <Screen contentStyle={{ paddingTop: space.sm }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <EmojiAvatar image={art} color="mint" size={96} name="Your iMessage stats" />
          {state.status === 'ready' ? null : <LargeTitle center title="Your iMessage stats" subtitle="See your real texting stats, counted on this phone. Nothing is uploaded." />}
        </View>
        {state.status === 'ready' ? (
          <Ready file={state.file} stats={state.stats} onImport={importFile} onRemove={remove} />
        ) : (
          <FadeIn style={{ gap: space.xxl }}>
            <ListSection header="How it works" inset={64}>
              {STEPS.map((step) => (
                <ListRow key={step.title} title={step.title} subtitle={step.detail} leading={<EmojiAvatar emoji={step.emoji} color={step.color} size={36} />} />
              ))}
            </ListSection>
            {state.status === 'reading' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.lg }}>
                <ActivityIndicator color={c.accent} />
                <Txt variant="callout" tone="secondary">
                  Reading your messages…
                </Txt>
              </View>
            ) : (
              <BigButton title="Import messages file" emoji="📥" onPress={importFile} />
            )}
            {state.status === 'error' ? (
              <Txt variant="footnote" color={c.danger} style={{ textAlign: 'center' }}>
                {state.message}
              </Txt>
            ) : null}
          </FadeIn>
        )}
      </Screen>
    </DesignFonts>
  );
}

const WAVE = require('../../../assets/art/hedgehog-wave.png');
const SLEEPY = require('../../../assets/art/hedgehog-sleepy.png');
const CHART = require('../../../assets/art/hedgehog-chart.png');

const STEPS: { title: string; detail: string; emoji: string; color: FillName }[] = [
  { title: 'Save for iPhone', detail: 'On your Mac, open Textrovert and click it', emoji: '💻', color: 'blue' },
  { title: 'Send it here', detail: 'AirDrop the file, or save it to Files', emoji: '📲', color: 'lilac' },
  { title: 'Import', detail: 'Tap the button below and pick the file', emoji: '📥', color: 'mint' },
];

const CARD_COLORS: FillName[] = ['mint', 'pink', 'lilac', 'yellow', 'peach', 'blue', 'coral', 'lime'];

interface Tile {
  value: string;
  label: string;
  emoji: string;
}

function Ready({ file, stats, onImport, onRemove }: { file: MessagesFile; stats: TextingStats; onImport: () => void; onRemove: () => void }) {
  if (stats.messages === 0) {
    return (
      <Txt variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
        That file has no messages in it.
      </Txt>
    );
  }
  const since = stats.since ? ' since ' + new Date(stats.since * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
  const [topEmoji] = stats.topEmoji;
  const tiles = [
    { value: percent(stats.sent / stats.messages), label: 'of them are from you', emoji: '📤' },
    stats.busiestHour !== undefined && { value: hour(stats.busiestHour), label: 'is when you text the most', emoji: '🌙' },
    stats.biggestDay && { value: count(stats.biggestDay.messages), label: 'messages on ' + day(stats.biggestDay.date) + ', your biggest day, mostly with ' + stats.biggestDay.mostlyWith, emoji: '📅' },
    stats.longestStreak && { value: String(stats.longestStreak.days), label: 'days in a row texting ' + stats.longestStreak.name, emoji: '🔥' },
    topEmoji && { value: stats.topEmoji.map((e) => e.emoji).join(' '), label: 'your top emoji, with ' + topEmoji.emoji + ' sent ' + count(topEmoji.count) + ' times', emoji: '🏆' },
    stats.laughs > 0 && { value: count(stats.laughs), label: 'times you laughed: lol, haha, 😂', emoji: '🤣' },
    stats.sent > 0 && { value: percent(stats.lateNight), label: 'of your texts go out after midnight', emoji: '🦉' },
    stats.loudestGroup && { value: count(stats.loudestGroup.messages), label: 'messages in ' + stats.loudestGroup.name + ', your loudest group chat', emoji: '📣' },
  ].filter((tile): tile is Tile => !!tile);
  const pairs = Array.from({ length: Math.ceil(tiles.length / 2) }, (_, i) => tiles.slice(i * 2, i * 2 + 2));

  return (
    <>
      <FadeIn>
        <LargeTitle center size="display" title={count(stats.messages)} subtitle={'messages across ' + count(stats.chats) + (stats.chats === 1 ? ' chat' : ' chats') + since} />
      </FadeIn>
      <View style={{ gap: space.md }}>
        {pairs.map((pair, r) => (
          <FadeIn key={pair[0].label} delay={60 + r * 60} style={{ flexDirection: 'row', gap: space.md }}>
            {pair.map((tile, i) => (
              <StatCard key={tile.label} value={tile.value} label={tile.label} emoji={tile.emoji} color={CARD_COLORS[(r * 2 + i) % CARD_COLORS.length]} />
            ))}
            {pair.length < 2 ? <View style={{ flex: 1 }} /> : null}
          </FadeIn>
        ))}
      </View>
      {stats.people.length > 0 ? (
        <ListSection header="Your top people">
          {stats.people.map((p) => (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={percent(p.fromYou / p.messages) + ' from you' + (p.streak >= 2 ? ' · ' + p.streak + '-day streak' : '') + ' · since ' + new Date(p.since * 1000).getFullYear()}
              leading={<EmojiAvatar name={p.name} size={40} />}
              value={count(p.messages)}
            />
          ))}
        </ListSection>
      ) : null}
      <Txt variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
        From your Mac · saved {day(new Date(file.exportedAt * 1000))}
      </Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.md }}>
        <PillButton title="Import a newer file" emoji="📥" onPress={onImport} />
        <PillButton title="Remove" kind="secondary" onPress={onRemove} />
      </View>
    </>
  );
}
