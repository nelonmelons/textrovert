import { useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { SymbolViewProps } from 'expo-symbols';
import { useDataMode } from '../api/mode';
import { clearOwnerKey } from '../api/owner';
import { useFriends } from '../api/people';
import { forgetSources } from '../api/sources';
import { forgetPortrait } from '../features/portrait/Portrait';
import { useNotes } from '../store';
import { useFirstRun } from '../firstRun';
import { Theme, Type } from '../theme';
import { Divider, SectionCard, Symbol, ToneTab } from '../components/Paper';
import { Avatar, BigButton, Screen, Txt } from '@/design';

const accounts: { id: string; name: string; symbol: SymbolViewProps['name']; purpose: string }[] = [
  { id: 'imessage', name: 'iMessage', symbol: 'message.fill', purpose: 'So I can spot plans, replies and birthdays in your texts.' },
  { id: 'instagram', name: 'Instagram', symbol: 'camera.fill', purpose: 'So I can catch plans and questions in your DMs.' },
  { id: 'tiktok', name: 'TikTok', symbol: 'music.note', purpose: 'So I can learn what friends are into from videos they send you.' },
  { id: 'snapchat', name: 'Snapchat', symbol: 'bolt.heart.fill', purpose: 'So I can remember plans you make in snaps and chats.' },
  { id: 'whatsapp', name: 'WhatsApp', symbol: 'phone.bubble.fill', purpose: 'So I can keep track of group plans and replies you owe.' },
];

const deniedMessage = 'Allow Contacts in Settings to import your people.';

export default function Settings() {
  const notes = useNotes();
  const { friends } = useFriends();
  const mode = useDataMode();
  const firstRun = useFirstRun();
  const [contacts, setContacts] = useState<string[]>();
  const [contactsMessage, setContactsMessage] = useState<string>();
  const [showingContacts, setShowingContacts] = useState(false);

  const importContacts = async () => {
    try {
      const { granted } = await requestPermissionsAsync();
      if (!granted) {
        setContactsMessage(deniedMessage);
        return;
      }
      const loaded = (await Contact.getAllDetails([ContactField.FULL_NAME]))
        .map((c) => c.fullName ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      setContacts(loaded);
      setContactsMessage(loaded.length ? `Loaded ${loaded.length} contacts on this device.` : 'No contacts found.');
      setShowingContacts(true);
    } catch {
      setContactsMessage('Contacts couldn’t be loaded. Please try again.');
    }
  };

  const logOut = async () => {
    // Forget this device's account first, so nothing after this reads the previous user's chats and the next
    // onboarding upload creates a fresh account instead of adding to the old one.
    await clearOwnerKey();
    forgetSources();
    forgetPortrait();
    await notes.reset();
    await firstRun.reset();
    router.dismissTo('/');
  };

  const confirmLogout = () => {
    const title = 'Log out?';
    const message = 'This clears your notes and setup on this phone.';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title, message, options: ['Log out', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 }, (index) => {
        if (index === 0) logOut();
      });
    } else if (Platform.OS === 'web') {
      if (window.confirm(title + '\n\n' + message)) logOut();
    } else {
      Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: logOut }]);
    }
  };

  return (
    <>
      <Screen back title="Settings" scene="sky" contentStyle={{ gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 10, paddingBottom: 8 }}>
          <Avatar name="Emma Di" size={88} />
          <Txt variant="largeTitle">Emma Di</Txt>
          <Txt variant="subhead" tone="secondary" shadow>
            {friends.length ? `${friends.length} people` : 'No people yet'}
          </Txt>
        </View>

        <SectionCard tone={Theme.celebrateTone}>
          <View style={{ gap: 14 }}>
            <ToneTab title="Connected accounts" symbol="link" tone={Theme.celebrateTone} />
            {accounts.map((account, index) => {
              return (
                <View key={account.id} style={{ gap: 14 }}>
                  {index > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                    <View style={styles.icon}>
                      <Symbol name={account.symbol} size={17} color="#FFFFFF" weight="semibold" />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[Type.headline, { color: Theme.ink }]}>{account.name}</Text>
                      <Text style={[Type.subheadline, { color: Theme.secondary }]}>{account.purpose}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Symbol name="circle.dashed" size={13} color={Theme.secondary} weight="semibold" />
                        <Text style={[Type.subheadline, { fontWeight: '600', color: Theme.secondary }]}>Not connected</Text>
                      </View>
                    </View>
                    <View accessibilityLabel={`Connect ${account.name}, not available yet`} style={styles.action}>
                      <Text style={[Type.footnote, { fontWeight: '700', color: Theme.secondary }]}>Soon</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard tone={Theme.activitiesTone}>
          <View style={{ gap: 12 }}>
            <ToneTab title="Your data" symbol="externaldrive.fill" tone={Theme.activitiesTone} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Symbol name={mode.live ? 'checkmark.circle.fill' : 'circle.dashed'} size={13} color={mode.live ? Theme.activitiesTone.ink : Theme.secondary} weight="semibold" />
              <Text style={[Type.footnote, { color: Theme.secondary, flex: 1 }]} numberOfLines={2}>
                {mode.live ? 'Connected to ' + mode.apiUrl.replace(/^https?:\/\//, '') : 'Not connected yet. Your people, Ask and profiles show up once your chats are synced.'}
              </Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard tone={Theme.plansTone}>
          <View style={{ gap: 12 }}>
            <ToneTab title="Your people" symbol="person.2.fill" tone={Theme.plansTone} />
            <Pressable onPress={importContacts} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, pressed && { opacity: 0.6 }]}>
              <Symbol name="person.crop.circle.badge.plus" size={18} color="#FFFFFF" />
              <Text style={[Type.body, { color: Theme.ink, fontWeight: '700' }]}>Import from Contacts</Text>
            </Pressable>
            {contactsMessage ? <Text style={[Type.subheadline, { color: Theme.secondary }]}>{contactsMessage}</Text> : null}
            <Text style={[Type.footnote, { color: Theme.secondary }]}>Contacts are only read after you tap import.</Text>
            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Symbol name="message" size={16} color={Theme.plansTone.ink} />
              <Text style={[Type.subheadline, { flex: 1, color: Theme.ink }]}>
                {firstRun.messagesExport ? `Messages export: ${firstRun.messagesExport.name}` : 'No Messages export added'}
              </Text>
            </View>
            <Pressable onPress={() => router.push('/setup')} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, pressed && { opacity: 0.6 }]}>
              <Symbol name="slider.horizontal.3" size={16} color="#FFFFFF" />
              <Text style={[Type.body, { color: Theme.ink, fontWeight: '700' }]}>Change sources</Text>
            </Pressable>
          </View>
        </SectionCard>

        <BigButton title="Log out" kind="secondary" icon="rectangle.portrait.and.arrow.right" onPress={confirmLogout} />
      </Screen>

      <Modal visible={showingContacts} presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setShowingContacts(false)}>
        <View style={{ flex: 1, backgroundColor: '#081721' }}>
          <View style={styles.sheetHeader}>
            <Text style={[Type.headline, { color: Theme.ink }]}>Your contacts</Text>
            <Pressable onPress={() => setShowingContacts(false)} hitSlop={10} style={{ position: 'absolute', right: 16 }}>
              <Text style={[Type.body, { fontWeight: '700', color: Theme.accentTone.ink }]}>Done</Text>
            </Pressable>
          </View>
          {contacts && contacts.length > 0 ? (
            <FlatList
              data={contacts}
              keyExtractor={(name, index) => name + index}
              contentContainerStyle={{ margin: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
              ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 52, backgroundColor: Theme.separator }} />}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 44 }}>
                  <Symbol name="person.crop.circle" size={20} color={Theme.secondary} />
                  <Text style={[Type.body, { color: Theme.ink }]}>{item}</Text>
                </View>
              )}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Symbol name="person.crop.circle" size={44} color={Theme.secondary} />
              <Text style={[Type.title3, { fontWeight: '700', color: Theme.ink }]}>No contacts found</Text>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.1)' },
  action: { paddingHorizontal: 12, minHeight: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  sheetHeader: { height: 56, alignItems: 'center', justifyContent: 'center' },
});
