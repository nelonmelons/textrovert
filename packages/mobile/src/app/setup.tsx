import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { Rounded, Theme, Type } from '../theme';
import { GridPaper, Symbol } from '../components/Paper';
import { MessagesExport, useFirstRun } from '../firstRun';

const fileSize = (bytes?: number) =>
  bytes === undefined ? '' : bytes < 1024 * 1024 ? ` · ${Math.max(1, Math.round(bytes / 1024))} KB` : ` · ${(bytes / 1024 / 1024).toFixed(1)} MB`;

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
  detail,
  busy = false,
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
  detail?: { text: string; warning?: boolean };
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={disabled ? 'text' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled || busy}
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
        {detail ? (
          <View style={styles.detail}>
            <Symbol name={detail.warning ? 'exclamationmark.circle.fill' : 'checkmark.circle.fill'} size={13} color={detail.warning ? Theme.deadline : tone.ink} weight="semibold" />
            <Text style={[Type.footnote, { flex: 1, fontWeight: '600', color: detail.warning ? Theme.deadline : tone.ink }]}>{detail.text}</Text>
          </View>
        ) : null}
      </View>
      {disabled ? null : busy ? (
        <ActivityIndicator size="small" color={tone.ink} style={{ marginTop: 2 }} />
      ) : (
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
  const firstRun = useFirstRun();
  const [messagesExport, setMessagesExport] = useState<MessagesExport | undefined>(firstRun.messagesExport);
  const [contactsOptIn, setContactsOptIn] = useState(firstRun.contactsOptIn);
  const [contactsDetail, setContactsDetail] = useState<{ text: string; warning?: boolean }>();
  const [busy, setBusy] = useState<Source>();
  const [pickError, setPickError] = useState<string>();
  const selected: Source[] = [...(messagesExport ? ['messages' as const] : []), ...(contactsOptIn ? ['contacts' as const] : [])];

  const toggleMessages = async () => {
    setPickError(undefined);
    if (messagesExport) {
      setMessagesExport(undefined);
      return;
    }
    setBusy('messages');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled) setMessagesExport({ name: result.assets[0].name, size: result.assets[0].size });
    } catch {
      setPickError('That file couldn’t be opened. Try choosing it again.');
    } finally {
      setBusy(undefined);
    }
  };

  const toggleContacts = async () => {
    if (contactsOptIn) {
      setContactsOptIn(false);
      setContactsDetail(undefined);
      return;
    }
    setBusy('contacts');
    try {
      const { granted } = await requestPermissionsAsync();
      if (!granted) {
        setContactsDetail({ text: 'Allow Contacts in Settings to find your people.', warning: true });
        return;
      }
      const count = (await Contact.getAllDetails([ContactField.FULL_NAME])).filter((c) => c.fullName).length;
      setContactsOptIn(true);
      setContactsDetail({ text: count ? `${count} contacts found on this phone. You’ll pick who to add.` : 'No contacts found on this phone yet.' });
    } catch {
      setContactsDetail({ text: 'Contacts couldn’t be loaded. Please try again.', warning: true });
    } finally {
      setBusy(undefined);
    }
  };

  const finish = async (choices: { messagesExport?: MessagesExport; contactsOptIn: boolean }) => {
    await firstRun.finish(choices);
    router.dismissTo('/');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 28 + insets.bottom }]}>
        <GridPaper width={width} height={height * 2} />
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require('../../assets/art/hedgehog-mark.png')} style={styles.mark} resizeMode="contain" />
            <Text style={styles.brandName}>textrovert</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => finish({ contactsOptIn: false })} hitSlop={12}>
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
            onPress={toggleMessages}
            busy={busy === 'messages'}
            detail={
              pickError
                ? { text: pickError, warning: true }
                : messagesExport
                  ? { text: `${messagesExport.name}${fileSize(messagesExport.size)} · stays on this phone` }
                  : undefined
            }
          />
          <SourceCard
            title="Contacts"
            description="Find and name the people you care about"
            note="You’ll choose who to add, and review access before anything is used."
            symbol="person.crop.circle"
            tone={Theme.activitiesTone}
            selected={selected.includes('contacts')}
            onPress={toggleContacts}
            busy={busy === 'contacts'}
            detail={contactsDetail}
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

        <Pressable accessibilityRole="button" onPress={() => finish({ messagesExport, contactsOptIn })} style={({ pressed }) => [styles.continueButton, pressed && styles.buttonPressed]}>
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
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2, paddingVertical: 2 },
  continueButton: { minHeight: 54, borderRadius: 18, backgroundColor: Theme.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 2 },
  buttonPressed: { opacity: 0.82 },
  continueText: { color: '#FFFFFF' },
  bottomNote: { color: Theme.secondary, textAlign: 'center', marginTop: -8 },
});
