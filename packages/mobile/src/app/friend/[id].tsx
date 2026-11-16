import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { BigButton, DesignFonts, EmojiAvatar, LargeTitle, ListRow, ListSection, Screen, space, Txt, useDesign } from '@/design';
import { deadlineText, Friend, firstName, NoteSection, sectionInfo, sectionOrder } from '../../people';
import { useFriend } from '../../api/people';
import { LiveProfile, useFriendProfile, WrappedButton } from '../../features/friend/LiveProfile';
import { Note, useNotes } from '../../store';

const HEART = require('../../../assets/art/hedgehog-heart.png');
const DETECTIVE = require('../../../assets/art/hedgehog-detective.png');

const SECTION_EMOJI: Record<NoteSection, string> = { reply: '↩️', plans: '📅', together: '🧑‍🤝‍🧑', memories: '📖', gifts: '🎁' };

const openSource = (friend: Friend, messageID: string) => router.push({ pathname: '/source', params: { friend: friend.id, message: messageID } });
const openEditor = (friend: Friend, section: NoteSection, id?: string) => router.push({ pathname: '/note', params: { friend: friend.id, section, ...(id ? { id } : {}) } });

function NoteRow({ friend, note }: { friend: Friend; note: Note }) {
  const source = friend.messages.find((m) => m.id === note.sourceID);
  const subtitle = [note.deadline ? deadlineText(note.deadline).text : '', note.detail ?? '', source ? (note.edited ? 'Edited by you' : '') : 'Added by you'].filter(Boolean).join(' · ');
  return (
    <ListRow
      wrap
      title={note.title}
      subtitle={subtitle || undefined}
      leading={<EmojiAvatar emoji={SECTION_EMOJI[note.section]} color="white" size={36} />}
      onPress={() => (source ? openSource(friend, source.id) : openEditor(friend, note.section, note.id))}
      chevron={false}
      trailing={
        <Pressable onPress={() => openEditor(friend, note.section, note.id)} accessibilityLabel={`Edit ${note.title}`} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Txt style={{ fontSize: 17 }}>✏️</Txt>
        </Pressable>
      }
    />
  );
}

function SectionBlock({ friend, section, hideEmpty }: { friend: Friend; section: NoteSection; hideEmpty?: boolean }) {
  const { items } = useNotes();
  const list = items(friend, section);
  if (hideEmpty && list.length === 0) return null;
  const info = sectionInfo[section];
  return (
    <ListSection header={info.title} footer={list.length === 0 ? info.empty(firstName(friend)) : undefined}>
      {list.map((note) => (
        <NoteRow key={note.id} friend={friend} note={note} />
      ))}
      <ListRow title={'Add a ' + info.noun} accessibilityLabel={`Add to ${info.title}`} leading={<EmojiAvatar emoji="➕" color="white" size={36} />} onPress={() => openEditor(friend, section)} />
    </ListSection>
  );
}

function Notepad({ friend }: { friend: Friend }) {
  const { c } = useDesign();
  const { notepad, setNotepad } = useNotes();
  const [text, setText] = useState(notepad(friend));
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(notepad(friend)), [notepad, friend]);
  return (
    <ListSection header="Notepad" footer={saved && text === notepad(friend) ? 'Saved ✓' : 'Only on this phone.'}>
      <TextInput
        value={text}
        onChangeText={(value) => {
          setText(value);
          setSaved(false);
        }}
        onEndEditing={async () => {
          await setNotepad(friend, text);
          setSaved(true);
        }}
        multiline
        placeholder={`Anything else about ${firstName(friend)}: sizes, allergies, inside jokes…`}
        placeholderTextColor={c.textTertiary}
        style={[{ minHeight: 110, padding: space.lg, fontSize: 16, lineHeight: 22, color: c.text, fontFamily: 'Geist_400Regular', textAlignVertical: 'top' }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
      />
    </ListSection>
  );
}

function LiveSections({ friend }: { friend: Friend }) {
  const { state, retry } = useFriendProfile(friend.name);
  const first = firstName(friend);
  return (
    <>
      <WrappedButton conversationId={state.status === 'ready' ? state.profile.dmConversationId : state.status === 'error' ? null : undefined} first={first} />
      <LiveProfile name={friend.name} first={first} state={state} retry={retry} />
    </>
  );
}

export default function FriendProfile() {
  const { c } = useDesign();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { friend, status } = useFriend(id);
  const header = <Stack.Screen options={{ headerTitle: '', headerStyle: { backgroundColor: c.background }, headerTintColor: c.accentText }} />;
  if (!friend)
    return (
      <DesignFonts>
        {header}
        <Screen contentStyle={{ paddingTop: space.sm, alignItems: 'center' }}>
          {status === 'loading' ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <>
              <Image source={DETECTIVE} resizeMode="contain" style={{ width: 160, height: 140 }} aria-hidden />
              <Txt variant="callout" tone="secondary">
                No one by that name in your chats.
              </Txt>
            </>
          )}
        </Screen>
      </DesignFonts>
    );
  const first = firstName(friend);
  return (
    <DesignFonts>
      {header}
      <Screen contentStyle={{ paddingTop: space.sm }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <View>
            <EmojiAvatar name={friend.name} size={112} />
            <EmojiAvatar image={HEART} color="white" size={48} style={{ position: 'absolute', right: -8, bottom: -4 }} />
          </View>
          <LargeTitle center title={friend.name} subtitle={friend.handle} />
        </View>
        <BigButton title={`Ask about ${first}`} emoji="💬" onPress={() => router.push({ pathname: '/chat', params: { friend: friend.id } })} />
        {friend.person ? <LiveSections friend={friend} /> : null}
        {sectionOrder.map((section) => (
          <SectionBlock key={section} friend={friend} section={section} hideEmpty={!!friend.person} />
        ))}
        <Notepad friend={friend} />
      </Screen>
    </DesignFonts>
  );
}
