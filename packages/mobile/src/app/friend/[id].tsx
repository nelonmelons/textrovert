import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolViewProps } from 'expo-symbols';
import { Friend, firstName, NoteSection, sectionInfo, sectionOrder, upcomingMilestones } from '../../people';
import { useFriend } from '../../api/people';
import { LiveProfile, ProfileCard, useFriendProfile } from '../../features/friend/LiveProfile';
import { haptics } from '../../lib/haptics';
import { Note, useNotes } from '../../store';
import { sectionTone } from '../../theme';
import { DeadlineBadge, ServiceIcon } from '../../components/Paper';
import { MilestoneRow } from '../../components/MilestoneRow';
import { WrappedEntry } from '../../components/WrappedEntry';
import { Backdrop, EmojiAvatar, Glass, Icon, IconButton, PillButton, PressScale, space, TopBar, Txt, useDesign } from '@/design';

const openSource = (friend: Friend, messageID: string) => router.push({ pathname: '/source', params: { friend: friend.id, message: messageID } });
const openEditor = (friend: Friend, section: NoteSection, id?: string) => router.push({ pathname: '/note', params: { friend: friend.id, section, ...(id ? { id } : {}) } });

const uiFont = Platform.OS === 'web' ? ({ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif', outlineStyle: 'none' } as object) : { fontFamily: 'Arial' };

const Hairline = () => <View style={{ height: 0.5, backgroundColor: 'rgba(255, 255, 255, 0.12)' }} />;

function NoteRow({ friend, note }: { friend: Friend; note: Note }) {
  const source = friend.messages.find((m) => m.id === note.sourceID);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <PressScale
        scale={0.985}
        onPress={() => (source ? openSource(friend, source.id) : openEditor(friend, note.section, note.id))}
        outerStyle={{ flex: 1 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          {note.deadline ? <DeadlineBadge deadline={note.deadline} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Txt variant="callout" style={{ fontWeight: '700' }}>
              {note.title}
            </Txt>
            {source ? <ServiceIcon service={source.service} /> : null}
          </View>
          {note.detail ? (
            <Txt variant="subhead" tone="secondary">
              {note.detail}
            </Txt>
          ) : null}
          {source && note.edited ? <Provenance symbol="pencil" text="Edited by you" /> : null}
          {!source ? <Provenance symbol="person.crop.circle" text="Added by you" /> : null}
        </View>
        {source ? <Icon name="chevron.right" size={12} color="rgba(255, 255, 255, 0.45)" /> : null}
      </PressScale>
      <IconButton icon="pencil" size={34} label={`Edit ${note.title}`} onPress={() => openEditor(friend, note.section, note.id)} />
    </View>
  );
}

function Provenance({ symbol, text }: { symbol: SymbolViewProps['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={symbol} size={11} color="rgba(255, 255, 255, 0.55)" />
      <Txt variant="footnote" tone="tertiary">
        {text}
      </Txt>
    </View>
  );
}

function SectionBlock({ friend, section, hideEmpty }: { friend: Friend; section: NoteSection; hideEmpty?: boolean }) {
  const { items } = useNotes();
  const list = items(friend, section);
  if (hideEmpty && list.length === 0) return null;
  const info = sectionInfo[section];
  return (
    <ProfileCard
      title={info.title}
      symbol={info.symbol as SymbolViewProps['name']}
      tint={sectionTone(section).ink}
      action={<PillButton title="Add" small icon={<Icon name="plus" size={12} />} accessibilityLabel={`Add to ${info.title}`} onPress={() => openEditor(friend, section)} />}
    >
      {list.length === 0 ? (
        <Txt variant="subhead" tone="secondary">
          {info.empty(firstName(friend))}
        </Txt>
      ) : null}
      {list.map((note, index) => (
        <View key={note.id} style={{ gap: space.sm }}>
          {index > 0 ? <Hairline /> : null}
          <NoteRow friend={friend} note={note} />
        </View>
      ))}
    </ProfileCard>
  );
}

function Notepad({ friend }: { friend: Friend }) {
  const { c } = useDesign();
  const { notepad, setNotepad } = useNotes();
  const [text, setText] = useState(notepad(friend));
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(notepad(friend)), [notepad, friend]);
  return (
    <ProfileCard
      title="Notepad"
      symbol="note.text"
      action={
        saved && text === notepad(friend) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="checkmark.circle.fill" size={12} color={c.success} />
            <Txt variant="footnote" color={c.success} style={{ fontWeight: '700' }}>
              Saved
            </Txt>
          </View>
        ) : null
      }
    >
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
        placeholderTextColor={c.placeholder}
        style={[{ minHeight: 104, padding: space.md, fontSize: 15, lineHeight: 21, color: '#FFFFFF', backgroundColor: c.input, borderRadius: 18, textAlignVertical: 'top' }, uiFont]}
      />
    </ProfileCard>
  );
}

/** The ask field for this one person: a Ditto input pill with Ditto's pink send key, the one hot action on the page. */
function AskAbout({ friend }: { friend: Friend }) {
  const { c } = useDesign();
  const [text, setText] = useState('');
  const first = firstName(friend);
  const trimmed = text.trim();
  const send = () => {
    if (!trimmed) return;
    haptics.select();
    setText('');
    router.push({ pathname: '/chat', params: { friend: friend.id, q: trimmed } });
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 52, paddingLeft: space.lg, paddingRight: 6, borderRadius: 999, backgroundColor: c.input, borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.18)' }}>
      <Icon name="sparkles" size={15} color={c.accentText} />
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        returnKeyType="send"
        placeholder={`Ask anything about ${first}…`}
        placeholderTextColor={c.placeholder}
        style={[{ flex: 1, height: 52, fontSize: 16, color: '#FFFFFF' }, uiFont]}
      />
      <View style={{ opacity: trimmed ? 1 : 0.45 }}>
        <IconButton icon="arrow.up" size={40} kind="pink" label={`Ask about ${first}`} onPress={send} />
      </View>
    </View>
  );
}

/** Opens this friend's Wrapped: a glass row with a sparkle tile. */
function WrappedButton({ conversationId, first }: { conversationId: string | null | undefined; first: string }) {
  const ready = !!conversationId;
  return (
    <PressScale
      accessibilityLabel={`Your Wrapped with ${first}`}
      onPress={
        ready
          ? () => {
              haptics.impact('light');
              router.push({ pathname: '/wrapped/[conversationId]', params: { conversationId: conversationId ?? '' } });
            }
          : undefined
      }
      style={{ opacity: ready ? 1 : 0.6 }}
    >
      <Glass tone="light" radius={24} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.lg }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 44, 171, 0.9)', boxShadow: '0px 0px 18px rgba(255, 44, 171, 0.45)' }}>
          <Icon name="sparkles" size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="headline" shadow>
            Your Wrapped with {first}
          </Txt>
          <Txt variant="subhead" tone="secondary" shadow>
            {conversationId === undefined ? 'Getting it ready…' : ready ? 'The last month of your DM, in highlights' : 'Wrapped needs a DM with them'}
          </Txt>
        </View>
        <Icon name="chevron.right" size={13} color="rgba(255, 255, 255, 0.7)" />
      </Glass>
    </PressScale>
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

/**
 * The pushed-screen frame: the calm horizon photograph, a scrolling column, and the glass back button over a short navy
 * fade so content scrolling under it stays out of its way.
 */
function Page({ children, title }: { children: ReactNode; title?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Backdrop scene="sky" />
      <ScrollView
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + space.huge, paddingHorizontal: space.gutter, gap: space.lg }}
      >
        {children}
      </ScrollView>
      <LinearGradient pointerEvents="none" colors={['rgba(8, 23, 33, 0.78)', 'rgba(8, 23, 33, 0.4)', 'rgba(8, 23, 33, 0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 96 }} />
      <TopBar title={title} />
    </View>
  );
}

export default function FriendProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { friend, status } = useFriend(id);
  if (!friend)
    return (
      <Page>
        {status === 'loading' ? (
          <ActivityIndicator color="#FFFFFF" style={{ paddingTop: space.huge }} />
        ) : (
          <Glass tone="dark" style={{ padding: space.xl }}>
            <Txt variant="callout">No one by that name in your chats.</Txt>
          </Glass>
        )}
      </Page>
    );
  const live = !!friend.person;
  const milestones = upcomingMilestones().filter((m) => m.friend.id === friend.id);
  return (
    <Page>
      <View style={{ alignItems: 'center', gap: space.sm, paddingTop: space.sm, paddingBottom: space.sm }}>
        <View style={{ padding: 4, borderRadius: 64, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.55)', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
          <EmojiAvatar name={friend.name} size={104} />
        </View>
        <Txt accessibilityRole="header" variant="display" numberOfLines={2} adjustsFontSizeToFit style={{ textAlign: 'center', marginTop: space.sm }}>
          {friend.name}
        </Txt>
        <Txt variant="callout" tone="secondary" shadow style={{ textAlign: 'center' }}>
          {friend.handle}
        </Txt>
      </View>
      <AskAbout friend={friend} />
      {milestones.map((milestone) => (
        <PressScale key={milestone.id} onPress={() => openSource(friend, milestone.sourceID)}>
          <Glass tone="dark" style={{ padding: space.lg }}>
            <MilestoneRow milestone={milestone} />
          </Glass>
        </PressScale>
      ))}
      {live ? <LiveSections friend={friend} /> : <WrappedEntry friend={friend} />}
      {sectionOrder.map((section) => (
        <SectionBlock key={section} friend={friend} section={section} hideEmpty={live} />
      ))}
      <Notepad friend={friend} />
    </Page>
  );
}
