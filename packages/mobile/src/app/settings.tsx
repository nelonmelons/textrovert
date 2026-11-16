import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { SymbolViewProps } from 'expo-symbols';
import { useDataMode } from '../api/mode';
import { useFriends } from '../api/people';
import { useNotes } from '../store';
import { useFirstRun } from '../firstRun';
import { Rounded, Theme, Type } from '../theme';
import { Divider, Face, SectionCard, Symbol, ToneTab } from '../components/Paper';
import { PaperScroll } from '../components/PaperScroll';

type AccountState = 'notConnected' | 'connecting' | 'connected' | 'needsAttention';

const stateInfo: Record<AccountState, { label: string; symbol: SymbolViewProps['name'] }> = {
  notConnected: { label: 'Not connected', symbol: 'circle.dashed' },
  connecting: { label: 'Connecting…', symbol: 'arrow.triangle.2.circlepath' },
  connected: { label: 'Connected', symbol: 'checkmark.circle.fill' },
  needsAttention: { label: 'Needs attention', symbol: 'exclamationmark.triangle.fill' },
};

const accounts: { id: string; name: string; symbol: SymbolViewProps['name']; purpose: string }[] = [
  { id: 'imessage', name: 'iMessage', symbol: 'message.fill', purpose: 'So I can spot plans, replies and birthdays in your texts.' },
  { id: 'instagram', name: 'Instagram', symbol: 'camera.fill', purpose: 'So I can catch plans and questions in your DMs.' },
  { id: 'tiktok', name: 'TikTok', symbol: 'music.note', purpose: 'So I can learn what friends are into from videos they send you.' },
  { id: 'snapchat', name: 'Snapchat', symbol: 'bolt.heart.fill', purpose: 'So I can remember plans you make in snaps and chats.' },
  { id: 'whatsapp', name: 'WhatsApp', symbol: 'phone.bubble.fill', purpose: 'So I can keep track of group plans and replies you owe.' },
];

const fixtureStates: Record<string, AccountState> = { imessage: 'connected', instagram: 'connected', whatsapp: 'needsAttention', tiktok: 'notConnected', snapchat: 'notConnected' };
const KEY = 'textrovert.demo.accounts.v1';
const deniedMessage = 'Allow Contacts in Settings to import your people.';

export default function Settings() {
  const notes = useNotes();
  const { friends } = useFriends();
  const mode = useDataMode();
  const firstRun = useFirstRun();
  const [states, setStates] = useState(fixtureStates);
  const [contacts, setContacts] = useState<string[]>();
  const [contactsMessage, setContactsMessage] = useState<string>();
  const [showingContacts, setShowingContacts] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        const stored: Record<string, AccountState> = JSON.parse(raw);
        setStates(Object.fromEntries(Object.entries(stored).map(([id, s]) => [id, s === 'connecting' ? 'notConnected' : s])));
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(states));
  }, [states, loaded]);

  const set = (id: string, state: AccountState) => setStates((current) => ({ ...current, [id]: state }));

  const connect = (id: string) => {
    set(id, 'connecting');
    setTimeout(() => setStates((current) => (current[id] === 'connecting' ? { ...current, [id]: 'connected' } : current)), 1200);
  };

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
    setStates(fixtureStates);
    setContacts(undefined);
    setContactsMessage(undefined);
    await mode.signOut();
    await firstRun.reset();
    router.dismissTo('/');
  };

  const confirmLogout = () => {
    const title = 'Log out?';
    const message = 'This signs this phone out and clears your notes. You’ll start again from sign in.';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title, message, options: ['Log out', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 }, (index) => {
        if (index === 0) logOut();
      });
    } else {
      Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: logOut }]);
    }
  };

  const confirmSignOut = () => {
    const title = 'Sign out?';
    const message = 'This phone stops reading your chats until you sign in again. Your notes stay.';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title, message, options: ['Sign out', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 }, (index) => {
        if (index === 0) mode.signOut();
      });
    } else {
      Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => mode.signOut() }]);
    }
  };

  const connected = Object.values(states).filter((s) => s === 'connected').length;

  return (
    <>
      <Stack.Screen options={{ headerTitle: 'Settings', headerTitleStyle: { color: Theme.ink, fontWeight: '600' } }} />
      <PaperScroll contentContainerStyle={{ padding: 24, gap: 22, paddingBottom: 60 }}>
        <SectionCard tone={Theme.accentTone}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Face initials="ED" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[Type.title2, { fontFamily: Rounded.bold, color: Theme.ink }]}>Emma Di</Text>
              <Text style={[Type.subheadline, { color: Theme.secondary }]}>
                {friends.length} friends · {connected} accounts connected
              </Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard tone={Theme.celebrateTone}>
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ToneTab title="Connected accounts" symbol="link" tone={Theme.celebrateTone} />
              <View style={styles.demo}>
                <Text style={[Type.caption, { fontWeight: '700', color: Theme.celebrateTone.ink }]}>Demo</Text>
              </View>
            </View>
            {accounts.map((account, index) => {
              const state = states[account.id] ?? 'notConnected';
              const attention = state === 'needsAttention';
              const action = state === 'connected' ? 'Disconnect' : attention ? 'Fix' : 'Connect';
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={stateInfo[state].label}>
                        {state === 'connecting' ? (
                          <ActivityIndicator size="small" style={{ transform: [{ scale: 0.7 }] }} />
                        ) : (
                          <Symbol name={stateInfo[state].symbol} size={13} color={attention ? Theme.deadline : state === 'connected' ? Theme.activitiesTone.ink : Theme.secondary} weight="semibold" />
                        )}
                        <Text style={[Type.subheadline, { fontWeight: '600', color: attention ? Theme.deadline : state === 'connected' ? Theme.activitiesTone.ink : Theme.secondary }]}>
                          {attention ? 'Needs attention · sign-in expired' : stateInfo[state].label}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      disabled={state === 'connecting'}
                      onPress={() => (state === 'connected' ? set(account.id, 'notConnected') : connect(account.id))}
                      accessibilityLabel={`${action} ${account.name}`}
                      style={({ pressed }) => [styles.action, { opacity: state === 'connecting' ? 0 : pressed ? 0.6 : 1, backgroundColor: state === 'connected' ? Theme.tertiaryFill : Theme.accentTone.fill }]}
                    >
                      <Text style={[Type.subheadline, { fontWeight: '600', color: state === 'connected' ? Theme.secondary : Theme.accent }]}>{action}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <Text style={[Type.footnote, { color: Theme.secondary }]}>These are pretend connections for the demo. No real accounts are linked and nothing leaves this phone.</Text>
          </View>
        </SectionCard>

        <SectionCard tone={Theme.activitiesTone}>
          <View style={{ gap: 12 }}>
            <ToneTab title="Your data" symbol="externaldrive.fill" tone={Theme.activitiesTone} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[Type.headline, { color: Theme.ink }]}>Demo data</Text>
                <Text style={[Type.subheadline, { color: Theme.secondary }]}>
                  {!mode.apiUrl
                    ? 'Not signed in, so the app shows sample friends. Sign in to use your own chats.'
                    : mode.live
                      ? 'Off: friends, Ask and profiles come from your chats.'
                      : 'On: the app shows sample friends instead of your chats.'}
                </Text>
              </View>
              <Switch
                value={!mode.live}
                disabled={!mode.apiUrl}
                onValueChange={(on) => mode.setDemo(on)}
                trackColor={{ true: Theme.activitiesTone.ink }}
                accessibilityLabel="Demo data"
              />
            </View>
            {mode.apiUrl ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Symbol name={mode.live ? 'checkmark.circle.fill' : 'circle.dashed'} size={13} color={mode.live ? Theme.activitiesTone.ink : Theme.secondary} weight="semibold" />
                <Text style={[Type.footnote, { color: Theme.secondary, flex: 1 }]} numberOfLines={1}>
                  {mode.live ? 'Connected to ' : 'Not using '}
                  {mode.apiUrl.replace(/^https?:\/\//, '')}
                </Text>
              </View>
            ) : null}
            <Divider />
            {mode.account ? (
              <Pressable onPress={confirmSignOut} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <Symbol name="person.crop.circle.badge.xmark" size={18} color={Theme.accent} />
                <Text style={[Type.body, { color: Theme.accent }]}>Sign out</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/login')} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <Symbol name="person.crop.circle.badge.checkmark" size={18} color={Theme.accent} />
                <Text style={[Type.body, { color: Theme.accent }]}>{mode.apiUrl ? 'Sign in to another server' : 'Sign in'}</Text>
              </Pressable>
            )}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  demo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: Theme.celebrateTone.ink },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.accentTone.fill },
  action: { paddingHorizontal: 12, minHeight: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 25, borderWidth: 1.5, borderColor: Theme.accent, backgroundColor: Theme.background },
  sheetHeader: { height: 56, alignItems: 'center', justifyContent: 'center' },
});
