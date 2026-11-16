import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { Theme, Type } from '../theme';
import { HedgehogMark, Symbol } from '../components/Paper';
import { Backdrop, BigButton, Eyebrow, Glass, PillButton, Txt } from '@/design';
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
      style={({ pressed }) => [pressed && !disabled && styles.pressed, disabled && styles.disabledCard]}
    >
      <Glass tone="dark" radius={24} style={selected ? styles.selectedCard : undefined}>
        <View style={styles.sourceCard}>
          <View style={[styles.icon, { backgroundColor: tone.fill }]}>
            <Symbol name={symbol} size={19} color={tone.ink} weight="semibold" />
          </View>
          <View style={styles.sourceCopy}>
            <View style={styles.sourceTitleRow}>
              <Text style={[Type.headline, styles.ink]}>{title}</Text>
              {status ? (
                <View style={styles.statusPill}>
                  <Text style={[Type.caption2, styles.status]}>{status}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[Type.subheadline, styles.ink]}>{description}</Text>
            <Text style={[Type.footnote, styles.secondary]}>{note}</Text>
            {detail ? (
              <View style={styles.detail}>
                <Symbol name={detail.warning ? 'exclamationmark.circle.fill' : 'checkmark.circle.fill'} size={13} color={detail.warning ? Theme.accentTone.ink : tone.ink} weight="semibold" />
                <Text style={[Type.footnote, { flex: 1, fontWeight: '700', color: detail.warning ? Theme.accentTone.ink : tone.ink }]}>{detail.text}</Text>
              </View>
            ) : null}
          </View>
          {disabled ? null : busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 2 }} />
          ) : (
            <View style={[styles.check, selected && styles.checkOn]}>{selected ? <Symbol name="checkmark" size={12} color="#081721" weight="bold" /> : null}</View>
          )}
        </View>
      </Glass>
    </Pressable>
  );
}

export default function Setup() {
  const insets = useSafeAreaInsets();
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
      <Backdrop scene="sky" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 28 + insets.bottom }]}>
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <HedgehogMark height={22} />
            <Txt variant="title2" style={{ fontSize: 24 }}>
              textrovert
            </Txt>
          </View>
          <PillButton title="Skip for now" small onPress={() => finish({ contactsOptIn: false })} />
        </View>

        <View style={styles.hero}>
          <Eyebrow text="A little context, on your terms" />
          <Txt variant="display">Keep the little things close.</Txt>
          <Txt variant="callout" tone="secondary" shadow style={{ maxWidth: 320 }}>
            Choose what helps Textrovert remember your people. You can change this anytime.
          </Txt>
        </View>

        <View style={{ paddingHorizontal: 4, marginBottom: -6 }}>
          <Eyebrow text="Bring in a little context" />
        </View>
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
            status="Coming later"
          />
        </View>

        <View style={styles.privacyNote}>
          <Symbol name="lock.shield" size={16} color="#FFFFFF" weight="semibold" />
          <Txt variant="footnote" tone="secondary" shadow style={{ flex: 1 }}>
            Nothing connects until you choose it. You can start with just one friend.
          </Txt>
        </View>

        <BigButton title="Continue" trailing="→" onPress={() => finish({ messagesExport, contactsOptIn })} />
        <Txt variant="footnote" tone="secondary" shadow style={{ textAlign: 'center', marginTop: -6 }}>
          You can add or remove sources later in Settings.
        </Txt>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 18 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hero: { gap: 10, paddingTop: 36, paddingBottom: 12, paddingHorizontal: 4 },
  cards: { gap: 12 },
  sourceCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  selectedCard: { borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.85)' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabledCard: { opacity: 0.6 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sourceCopy: { flex: 1, gap: 4 },
  sourceTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  ink: { color: Theme.ink },
  secondary: { color: Theme.secondary },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)' },
  status: { color: '#FFFFFF', fontWeight: '600' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.45)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 },
});
