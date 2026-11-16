import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { BigButton, Eyebrow, LargeTitle, ListRow, ListSection, PillButton, Screen, space, StatCard, Txt, useDesign, type FillName } from '@/design';
import { FadeIn } from '@/components/FadeIn';
import { haptics } from '@/lib/haptics';
import { readMessagesFile, textingStats, type MessagesFile, type TextingStats } from '@/lib/messagesFile';
import { Initials } from './parts';

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
  return (
    <Screen back scene="twilight">
      {state.status === 'ready' ? null : (
        <View style={{ gap: space.md }}>
          <Eyebrow text="From your Mac" />
          <LargeTitle size="display" title="Your iMessage stats" subtitle="See your real texting stats, counted on this phone. Nothing is uploaded." />
        </View>
      )}
      {state.status === 'ready' ? (
        <Ready file={state.file} stats={state.stats} onImport={importFile} onRemove={remove} />
      ) : (
        <FadeIn style={{ gap: space.xxl }}>
          <ListSection header="How it works" inset={64}>
            {STEPS.map((step, i) => (
              <ListRow key={step.title} title={step.title} subtitle={step.detail} leading={<StepNumber n={i + 1} />} />
            ))}
          </ListSection>
          {state.status === 'reading' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.lg }}>
              <ActivityIndicator color="#FFFFFF" />
              <Txt variant="callout" tone="secondary" shadow>
                Reading your messages…
              </Txt>
            </View>
          ) : (
            <BigButton title="Import messages file" icon={{ ios: 'square.and.arrow.down', android: 'download', web: 'download' }} onPress={importFile} />
          )}
          {state.status === 'error' ? (
            <Txt variant="footnote" color={c.danger} shadow style={{ textAlign: 'center' }}>
              {state.message}
            </Txt>
          ) : null}
        </FadeIn>
      )}
    </Screen>
  );
}

/** A step number in Argent Pixel on a glass circle. */
function StepNumber({ n }: { n: number }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.32)', alignItems: 'center', justifyContent: 'center' }}>
      <Txt variant="stat" style={{ fontSize: 18, lineHeight: 22 }}>
        {n}
      </Txt>
    </View>
  );
}

const STEPS: { title: string; detail: string }[] = [
  { title: 'Save for iPhone', detail: 'On your Mac, open Textrovert and click it' },
  { title: 'Send it here', detail: 'AirDrop the file, or save it to Files' },
  { title: 'Import', detail: 'Tap the button below and pick the file' },
];

/** The first tile's number is Ditto pink; the rest are white. */
const CARD_COLORS: FillName[] = ['pink', 'white', 'white', 'white', 'white', 'white', 'white', 'white'];

interface Tile {
  value: string;
  label: string;
  emoji: string;
}

function Ready({ file, stats, onImport, onRemove }: { file: MessagesFile; stats: TextingStats; onImport: () => void; onRemove: () => void }) {
  if (stats.messages === 0) {
    return (
      <Txt variant="callout" tone="secondary" shadow style={{ textAlign: 'center' }}>
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
      <FadeIn style={{ gap: space.sm }}>
        <Eyebrow text="Your iMessage stats" />
        <Txt variant="stat" accessibilityRole="header" style={{ fontSize: 64, lineHeight: 70 }}>
          {count(stats.messages)}
        </Txt>
        <Txt variant="callout" tone="secondary" shadow>
          {'messages across ' + count(stats.chats) + (stats.chats === 1 ? ' chat' : ' chats') + since}
        </Txt>
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
              leading={<Initials name={p.name} />}
              value={count(p.messages)}
            />
          ))}
        </ListSection>
      ) : null}
      <Txt variant="footnote" tone="tertiary" shadow style={{ textAlign: 'center' }}>
        From your Mac · saved {day(new Date(file.exportedAt * 1000))}
      </Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.md }}>
        <PillButton title="Import a newer file" kind="primary" onPress={onImport} />
        <PillButton title="Remove" kind="secondary" onPress={onRemove} />
      </View>
    </>
  );
}
