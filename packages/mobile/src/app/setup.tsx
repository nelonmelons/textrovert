import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rounded, Theme, Type } from '../theme';
import { GridPaper, Symbol } from '../components/Paper';

type Source = 'messages' | 'contacts';

function SourceCard({
  title,
  description,
  note,
  symbol,
  tone,
  selected,
  onPress,
  disabled = false,
  status,
}: {
  title: string;
  description: string;
  note: string;
  symbol: 'message' | 'person.crop.circle' | 'camera';
  tone: { ink: string; fill: string };
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  status?: string;
}) {
  return (
    <Pressable
      accessibilityRole={disabled ? 'text' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sourceCard, pressed && !disabled && styles.pressed, disabled && styles.disabledCard]}
    >
      <View style={[styles.icon, { backgroundColor: tone.fill }]}>
        <Symbol name={symbol} size={20} color={tone.ink} weight="semibold" />
      </View>
      <View style={styles.sourceCopy}>
        <View style={styles.sourceTitleRow}>
          <Text style={[Type.headline, styles.ink, { fontFamily: Rounded.bold }]}>{title}</Text>
          {status ? <Text style={[Type.caption, styles.status]}>{status}</Text> : null}
        </View>
        <Text style={[Type.subheadline, styles.ink]}>{description}</Text>
        <Text style={[Type.footnote, styles.secondary]}>{note}</Text>
      </View>
      {disabled ? null : (
        <View style={[styles.check, selected && { backgroundColor: tone.ink, borderColor: tone.ink }]}>
          {selected ? <Symbol name="checkmark" size={12} color="#FFFFFF" weight="bold" /> : null}
        </View>
      )}
    </Pressable>
  );
}

export default function Setup() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [selected, setSelected] = useState<Source[]>([]);
  const toggle = (source: Source) =>
    setSelected((current) => (current.includes(source) ? current.filter((item) => item !== source) : [...current, source]));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 28 + insets.bottom }]}>
        <GridPaper width={width} height={height * 2} />
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require('../../assets/art/hedgehog-mark.png')} style={styles.mark} resizeMode="contain" />
            <Text style={styles.brandName}>textrovert</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} hitSlop={12}>
            <Text style={[Type.subheadline, styles.secondary]}>Skip for now</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>A little context, on your terms</Text>
            <Text style={[Type.largeTitle, styles.title]}>Keep the little things close.</Text>
            <Text style={[Type.body, styles.secondary, { marginTop: 8 }]}>Choose what helps Textrovert remember your people. You can change this anytime.</Text>
          </View>
          <Image source={require('../../assets/art/hedgehog-reader.png')} style={styles.reader} resizeMode="contain" />
        </View>

        <Text style={[Type.title3, styles.sectionTitle]}>Bring in a little context</Text>
        <View style={styles.cards}>
          <SourceCard
            title="Messages export"
            description="Add a chat export from your Mac"
            note="iPhone apps can’t read your full iMessage history directly. You choose the export file."
            symbol="message"
            tone={Theme.repliesTone}
            selected={selected.includes('messages')}
            onPress={() => toggle('messages')}
          />
          <SourceCard
            title="Contacts"
            description="Find and name the people you care about"
            note="You’ll choose who to add, and review access before anything is used."
            symbol="person.crop.circle"
            tone={Theme.activitiesTone}
            selected={selected.includes('contacts')}
            onPress={() => toggle('contacts')}
          />
          <SourceCard
            title="Instagram"
            description="Connect your conversations"
            note="Instagram inbox connection isn’t available yet. You can still add context yourself."
            symbol="camera"
            tone={Theme.coralTone}
            disabled
            status="COMING LATER"
          />
        </View>

        <View style={styles.privacyNote}>
          <Symbol name="lock.shield" size={16} color={Theme.activitiesTone.ink} weight="semibold" />
          <Text style={[Type.footnote, styles.secondary, { flex: 1 }]}>Nothing connects until you choose it. You can start with just one friend.</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={({ pressed }) => [styles.continueButton, pressed && styles.buttonPressed]}>
          <Text style={[Type.headline, styles.continueText, { fontFamily: Rounded.bold }]}>Continue</Text>
          <Symbol name="arrow.right" size={16} color="#FFFFFF" weight="bold" />
        </Pressable>
        <Text style={[Type.caption, styles.bottomNote]}>You can add or remove sources later in Settings.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.paper },
  content: { paddingHorizontal: 22, gap: 18 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mark: { width: 27, height: 27, tintColor: Theme.accent },
  brandName: { fontFamily: Rounded.heavy, color: Theme.accent, fontSize: 17 },
  hero: { flexDirection: 'row', alignItems: 'center', minHeight: 152, gap: 4 },
  heroCopy: { flex: 1 },
  eyebrow: { fontFamily: Rounded.bold, fontSize: 13, lineHeight: 18, color: Theme.accent, marginBottom: 6 },
  title: { fontFamily: Rounded.heavy, color: Theme.ink, fontSize: 31, lineHeight: 36 },
  reader: { width: 98, height: 128, marginRight: -4 },
  sectionTitle: { fontFamily: Rounded.bold, color: Theme.ink, marginTop: 2 },
  cards: { gap: 11 },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(60, 60, 67, 0.12)',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabledCard: { opacity: 0.72 },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sourceCopy: { flex: 1, gap: 4 },
  sourceTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  ink: { color: Theme.ink },
  secondary: { color: Theme.secondary },
  status: { color: Theme.coralTone.ink, fontFamily: Rounded.bold, letterSpacing: 0.4 },
  check: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: Theme.separator, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2, paddingVertical: 2 },
  continueButton: { minHeight: 54, borderRadius: 18, backgroundColor: Theme.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 2 },
  buttonPressed: { opacity: 0.82 },
  continueText: { color: '#FFFFFF' },
  bottomNote: { color: Theme.secondary, textAlign: 'center', marginTop: -8 },
});
