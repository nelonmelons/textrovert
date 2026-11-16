import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolViewProps } from 'expo-symbols';
import { Friend, firstName, friendById, NoteSection, sectionInfo, sectionOrder, upcomingMilestones } from '../../fixtures';
import { Note, useNotes } from '../../store';
import { Rounded, sectionTone, Theme, Type, withAlpha } from '../../theme';
import { art, DeadlineBadge, Divider, Face, RowChevron, SectionCard, ServiceIcon, Symbol, ToneTab } from '../../components/Paper';
import { MilestoneRow } from '../../components/MilestoneRow';
import { PaperScroll } from '../../components/PaperScroll';
import { AskBox } from '../../components/AskBox';

const openSource = (friend: Friend, messageID: string) => router.push({ pathname: '/source', params: { friend: friend.id, message: messageID } });
const openEditor = (friend: Friend, section: NoteSection, id?: string) => router.push({ pathname: '/note', params: { friend: friend.id, section, ...(id ? { id } : {}) } });

function NoteRow({ friend, note }: { friend: Friend; note: Note }) {
  const source = friend.messages.find((m) => m.id === note.sourceID);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
      <Pressable
        onPress={() => (source ? openSource(friend, source.id) : openEditor(friend, note.section, note.id))}
        style={({ pressed }) => [styles.noteBody, pressed && styles.pressed]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          {note.deadline ? <DeadlineBadge deadline={note.deadline} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[Type.subheadline, { color: Theme.ink, fontWeight: '600' }]}>{note.title}</Text>
            {source ? <ServiceIcon service={source.service} /> : null}
          </View>
          {note.detail ? <Text style={[Type.subheadline, { color: Theme.secondary }]}>{note.detail}</Text> : null}
          {source && note.edited ? <Provenance symbol="pencil" text="Edited by you" /> : null}
          {!source ? <Provenance symbol="person.crop.circle" text="Added by you" /> : null}
        </View>
        {source ? <RowChevron /> : null}
      </Pressable>
      <Pressable onPress={() => openEditor(friend, note.section, note.id)} accessibilityLabel={`Edit ${note.title}`} style={styles.pencil}>
        <Symbol name="pencil" size={15} color={Theme.accent} weight="semibold" />
      </Pressable>
    </View>
  );
}

function Provenance({ symbol, text }: { symbol: SymbolViewProps['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Symbol name={symbol} size={11} color={Theme.secondary} />
      <Text style={[Type.caption, { color: Theme.secondary }]}>{text}</Text>
    </View>
  );
}

function SectionBlock({ friend, section }: { friend: Friend; section: NoteSection }) {
  const { items } = useNotes();
  const list = items(friend, section);
  const info = sectionInfo[section];
  const tone = sectionTone(section);
  return (
    <SectionCard tone={tone}>
      <View style={{ gap: 10 }}>
        <View style={styles.header}>
          <ToneTab title={info.title} symbol={info.symbol as SymbolViewProps['name']} tone={tone} style={{ alignSelf: 'center' }} />
          <Pressable onPress={() => openEditor(friend, section)} accessibilityLabel={`Add to ${info.title}`} style={styles.add}>
            <Symbol name="plus" size={14} color={Theme.accent} weight="semibold" />
            <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Add</Text>
          </Pressable>
        </View>
        {list.length === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {section === 'memories' ? <Image source={art.leaf} style={{ height: 56, width: 56 }} resizeMode="contain" /> : null}
            <Text style={[Type.subheadline, { color: Theme.secondary, flex: 1 }]}>{info.empty(firstName(friend))}</Text>
          </View>
        ) : null}
        {list.map((note, index) => (
          <View key={note.id} style={{ gap: 10 }}>
            {index > 0 ? <Divider /> : null}
            <NoteRow friend={friend} note={note} />
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

function Notepad({ friend }: { friend: Friend }) {
  const { notepad, setNotepad } = useNotes();
  const [text, setText] = useState(notepad(friend));
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(notepad(friend)), [notepad, friend]);
  return (
    <SectionCard tone={Theme.accentTone}>
      <View style={{ gap: 10 }}>
        <View style={styles.header}>
          <ToneTab title="Notepad" symbol="note.text" tone={Theme.accentTone} style={{ alignSelf: 'center' }} />
          {saved && text === notepad(friend) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
              <Symbol name="checkmark.circle.fill" size={13} color={Theme.activitiesTone.ink} weight="semibold" />
              <Text style={[Type.subheadline, { color: Theme.activitiesTone.ink, fontWeight: '600' }]}>Saved</Text>
            </View>
          ) : null}
        </View>
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
          placeholderTextColor={Theme.secondary}
          style={[Type.subheadline, styles.notepad]}
        />
      </View>
    </SectionCard>
  );
}

export default function FriendProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friend = friendById(id);
  if (!friend) return null;
  const milestones = upcomingMilestones().filter((m) => m.friend.id === friend.id);
  return (
    <PaperScroll contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 18 }} keyboardDismissMode="interactive">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Face initials={friend.initials} />
        <View style={{ gap: 4, flex: 1 }}>
          <Text style={[Type.title, { fontFamily: Rounded.bold, color: Theme.ink }]}>{friend.name}</Text>
          <Text style={[Type.body, { color: Theme.secondary }]}>{friend.handle}</Text>
        </View>
      </View>
      {milestones.map((milestone) => (
        <Pressable key={milestone.id} onPress={() => openSource(friend, milestone.sourceID)} style={({ pressed }) => pressed && styles.pressed}>
          <SectionCard tone={Theme.celebrateTone} fillOpacity={0.55}>
            <MilestoneRow milestone={milestone} />
          </SectionCard>
        </Pressable>
      ))}
      <AskBox friend={friend} ask={(q) => router.push({ pathname: '/chat', params: { friend: friend.id, q } })} />
      {sectionOrder.map((section) => (
        <SectionBlock key={section} friend={friend} section={section} />
      ))}
      <Notepad friend={friend} />
    </PaperScroll>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, minWidth: 44, justifyContent: 'center' },
  noteBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  pencil: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: withAlpha(Theme.accentTone.fill, 0.6), opacity: 0.75, borderRadius: 12 },
  notepad: {
    minHeight: 96,
    padding: 12,
    color: Theme.ink,
    backgroundColor: Theme.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withAlpha(Theme.accent, 0.35),
    textAlignVertical: 'top',
  },
});
