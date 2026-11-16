import { useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { SymbolViewProps } from 'expo-symbols';
import { useDataMode } from '../api/mode';
import { useFriends } from '../api/people';
import { useNotes } from '../store';
import { useFirstRun } from '../firstRun';
import { Rounded, Theme, Type } from '../theme';
import { Divider, Face, SectionCard, Symbol, ToneTab } from '../components/Paper';
import { PaperScroll } from '../components/PaperScroll';

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
    } else {
      Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: logOut }]);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Settings', headerTitleStyle: { color: Theme.ink, fontWeight: '600' } }} />
      <PaperScroll contentContainerStyle={{ padding: 24, gap: 22, paddingBottom: 60 }}>
        <SectionCard tone={Theme.accentTone}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Face initials="ED" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[Type.title2, { fontFamily: Rounded.bold, color: Theme.ink }]}>Emma Di</Text>
              <Text style={[Type.subheadline, { color: Theme.secondary }]}>{friends.length ? `${friends.length} friends` : 'No people yet'}</Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard tone={Theme.celebrateTone}>
          <View style={{ gap: 14 }}>
            <ToneTab title="Connected accounts" symbol="link" tone={Theme.celebrateTone} />
            {accounts.map((account, index) => {
              return (
                <View key={account.id} style={{ gap: 14 }}>
                  {index > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                    <View style={styles.icon}>
                      <Symbol name={account.symbol} size={17} color={Theme.accent} weight="semibold" />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[Type.headline, { color: Theme.ink }]}>{account.name}</Text>
                      <Text style={[Type.subheadline, { color: Theme.secondary }]}>{account.purpose}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Symbol name="circle.dashed" size={13} color={Theme.secondary} weight="semibold" />
                        <Text style={[Type.subheadline, { fontWeight: '600', color: Theme.secondary }]}>Not connected</Text>
                      </View>
                    </View>
                    <View accessibilityLabel={`Connect ${account.name}, not available yet`} style={[styles.action, { backgroundColor: Theme.tertiaryFill }]}>
                      <Text style={[Type.subheadline, { fontWeight: '600', color: Theme.secondary }]}>Connect</Text>
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
              <Symbol name="person.crop.circle.badge.plus" size={18} color={Theme.accent} />
              <Text style={[Type.body, { color: Theme.accent }]}>Import from Contacts</Text>
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
              <Symbol name="slider.horizontal.3" size={16} color={Theme.accent} />
              <Text style={[Type.body, { color: Theme.accent }]}>Change sources</Text>
            </Pressable>
          </View>
        </SectionCard>

        <Pressable onPress={confirmLogout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.75 }]}>
          <Symbol name="rectangle.portrait.and.arrow.right" size={16} color={Theme.accent} weight="semibold" />
          <Text style={[Type.body, { fontWeight: '600', color: Theme.accent }]}>Log out</Text>
        </Pressable>
      </PaperScroll>

      <Modal visible={showingContacts} presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setShowingContacts(false)}>
        <View style={{ flex: 1, backgroundColor: Theme.secondaryBackground }}>
          <View style={styles.sheetHeader}>
            <Text style={[Type.headline, { color: Theme.ink }]}>Your contacts</Text>
            <Pressable onPress={() => setShowingContacts(false)} hitSlop={10} style={{ position: 'absolute', right: 16 }}>
              <Text style={[Type.body, { fontWeight: '600', color: Theme.accent }]}>Done</Text>
            </Pressable>
          </View>
          {contacts && contacts.length > 0 ? (
            <FlatList
              data={contacts}
              keyExtractor={(name, index) => name + index}
              contentContainerStyle={{ margin: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: Theme.background }}
              ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 52, backgroundColor: Theme.separator }} />}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 44 }}>
                  <Symbol name="person.crop.circle" size={20} color={Theme.accent} />
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
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.accentTone.fill },
  action: { paddingHorizontal: 12, minHeight: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 25, borderWidth: 1.5, borderColor: Theme.accent, backgroundColor: Theme.background },
  sheetHeader: { height: 56, alignItems: 'center', justifyContent: 'center' },
});
