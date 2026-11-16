import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { hedgehog, mascot } from './mockups/data';
import {
  AppIconTile, AvatarStack, BigButton, ChatBubble, ChatPanel, Chip, EmojiAvatar, Header, LargeTitle, ListRow, ListSection, PillButton,
  ScanHighlight, SchemeProvider, SegmentedControl, Sheet, StatCard, TabBar, TileGrid, Txt, avatarFills, fills, radii, space, type, useDesign, type Scheme,
} from '.';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="footnote" tone="secondary" style={{ fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {title}
      </Txt>
      {children}
    </View>
  );
}

function Gallery({ onSheet }: { onSheet: () => void }) {
  const { c, scheme } = useDesign();
  const [seg, setSeg] = useState(0);
  return (
    <View style={{ backgroundColor: c.background, paddingHorizontal: space.gutter, paddingVertical: space.xxxl, gap: space.xxxl }}>
      <LargeTitle eyebrow={scheme === 'dark' ? 'Dark' : 'Light'} title="Design v2" subtitle="Simple, sleek and a little bit playful. Every piece of the new look." trailing={<EmojiAvatar {...mascot} size={52} />} />
      <Section title="Colour">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(['background', 'grouped', 'text', 'textSecondary', 'accent', 'bubbleMine', 'darkCard'] as const).map((k) => (
            <View key={k} style={{ alignItems: 'center', gap: 4, width: 44 }}>
              <View style={{ width: 40, height: 40, borderRadius: radii.sm, backgroundColor: c[k], borderWidth: 1, borderColor: c.edge }} />
              <Txt variant="caption" tone="secondary" style={{ fontSize: 9 }} numberOfLines={1}>
                {k}
              </Txt>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {avatarFills.map((f) => (
            <View key={f} style={{ flex: 1, height: 28, borderRadius: radii.xs, backgroundColor: fills[f].fill, borderBottomWidth: 4, borderBottomColor: fills[f].edge }} />
          ))}
        </View>
      </Section>
      <Section title="Type">
        {(['display', 'largeTitle', 'title2', 'headline', 'body', 'footnote'] as const).map((t) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
            <Txt variant="caption" tone="tertiary" style={{ width: 64 }}>
              {type[t].fontSize}pt
            </Txt>
            <Txt variant={t} numberOfLines={1} style={{ flex: 1 }}>
              {t === 'display' ? 'Hey there 👋' : t}
            </Txt>
          </View>
        ))}
      </Section>
      <Section title="EmojiAvatar · AvatarStack">
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <EmojiAvatar name="Mira Okafor" size={56} />
          <EmojiAvatar emoji="🎉" color="yellow" size={56} />
          <EmojiAvatar image={hedgehog.dance} color="blue" size={56} />
          <EmojiAvatar image={hedgehog.reader} color="mint" size={56} />
          <EmojiAvatar name="Theo Lindqvist" size={40} />
        </View>
        <AvatarStack size={52} bounce people={[{ name: 'Juno Park', color: 'pink' }, { emoji: '💌', color: 'pink' }, { image: hedgehog.leaf, color: 'mint' }, mascot, { emoji: '😂', color: 'lilac' }, { name: 'Kit Moreau' }, { name: 'Ines Duarte' }, { name: 'Sami Haddad' }]} />
      </Section>
      <Section title="Buttons">
        <BigButton title="Get started" onPress={() => {}} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <PillButton title="Ask" emoji="💬" onPress={() => {}} />
          <PillButton title="Share" kind="secondary" onPress={() => {}} />
          <PillButton title="Party" emoji="🎉" kind="yellow" onPress={() => {}} />
          <PillButton title="Love" emoji="💖" kind="pink" small onPress={() => {}} />
        </View>
        <BigButton title="Open sheet" kind="secondary" emoji="🧾" trailing={null} onPress={onSheet} />
      </Section>
      <Section title="Chip · SegmentedControl">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Chip label="All" selected count={12} />
          <Chip label="Plans" emoji="🗓️" />
          <Chip label="Cabin crew" emoji="🏕️" count={2} tint="mint" />
          <Chip label="Mira" emoji="💬" tint="pink" />
        </View>
        <SegmentedControl segments={['Week', 'Month', 'Year']} value={seg} onChange={setSeg} />
      </Section>
      <Section title="ChatBubble · ScanHighlight">
        <ChatPanel>
          <ChatBubble name="Juno" text="is everyone still good for saturday? 🎂" time="18:02" />
          <ChatBubble mine text="obviously, I made a playlist" time="18:03" />
          <ScanHighlight avatar={mascot} rest={0.55}>
            <View style={{ gap: space.sm }}>
              <ChatBubble name="Theo" text="I might be a little late lol" time="18:05" highlighted />
              <ChatBubble mine text="theo you said that last time" time="18:05" />
            </View>
          </ScanHighlight>
        </ChatPanel>
      </Section>
      <Section title="StatCard">
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatCard value="52K" label="Messages read" emoji="📚" color="mint" onPress={() => {}} />
          <StatCard value="88" label="Inside jokes" emoji="😂" color="pink" onPress={() => {}} />
        </View>
      </Section>
      <Section title="AppIconTile · TileGrid">
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          {(['🍻', '❤️‍🔥', '✈️', '🦋', '💍'] as const).map((e, i) => (
            <AppIconTile key={e} emoji={e} color={(['peach', 'pink', 'lilac', 'blue', 'yellow'] as const)[i]} size={52} onPress={() => {}} />
          ))}
        </View>
        <TileGrid items={[{ emoji: '🍻', label: 'The group', color: 'peach' }, { emoji: '❤️‍🔥', label: 'Your person', color: 'pink' }, { emoji: '📱', label: 'Talking stage', color: 'mint' }, { emoji: '✈️', label: 'Far away', color: 'lilac' }]} footer="And everyone else." />
      </Section>
      <Section title="ListRow · Header">
        <Header title="Today" leading={<Txt tone="accent" variant="body">‹ Back</Txt>} trailing={<PillButton title="Edit" kind="secondary" small />} />
        <View style={{ backgroundColor: c.grouped, padding: space.md, borderRadius: radii.xl, marginHorizontal: -space.sm }}>
          <ListSection header="Friends" footer="Inset-grouped, like Settings.">
            <ListRow title="Mira Okafor" subtitle="Planning the cabin trip" leading={<EmojiAvatar name="Mira Okafor" size={40} />} onPress={() => {}} />
            <ListRow title="Notifications" leading={<AppIconTile emoji="🔔" color="coral" size={30} />} value="On" onPress={() => {}} />
          </ListSection>
        </View>
      </Section>
      <Section title="TabBar">
        <View style={{ height: 96, borderRadius: radii.xl, backgroundColor: c.grouped, overflow: 'hidden' }}>
          <TabBar tabs={[{ key: 'a', label: 'Today', emoji: '☀️' }, { key: 'b', label: 'Ask', emoji: '💬' }, { key: 'c', label: 'People', emoji: '👯' }, { key: 'd', label: 'You', emoji: '🦔' }]} active="b" />
        </View>
      </Section>
      <Section title="Mockups">
        {(['today', 'ask', 'people', 'you'] as const).map((m) => (
          <ListRow key={m} title={m[0].toUpperCase() + m.slice(1)} onPress={() => router.push({ pathname: `/design/${m}` as never, params: { scheme } })} />
        ))}
        {(['opener', 'guess', 'ghost', 'finale'] as const).map((slide) => (
          <ListRow key={slide} title={`Wrapped · ${slide}`} onPress={() => router.push({ pathname: '/design/wrapped' as never, params: { slide, scheme } })} />
        ))}
      </Section>
    </View>
  );
}

/** The living style guide: every component in light then dark (or one scheme with ?scheme=). */
export function StyleGuide({ only }: { only?: Scheme }) {
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Scheme>('light');
  const [open, setOpen] = useState(false);
  const schemes: Scheme[] = only ? [only] : ['light', 'dark'];
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top }}>
        {schemes.map((s) => (
          <SchemeProvider key={s} scheme={s}>
            <Gallery onSheet={() => (setSheet(s), setOpen(true))} />
          </SchemeProvider>
        ))}
      </ScrollView>
      <SchemeProvider scheme={sheet}>
          <Sheet visible={open} onClose={() => setOpen(false)} emoji="🧾" title="A sheet" subtitle="Springs up, fades with Reduce Motion">
            <ChatPanel>
              <ChatBubble name="Mira" text="this is what receipts look like" time="09:12" />
            </ChatPanel>
          </Sheet>
        </SchemeProvider>
    </View>
  );
}

