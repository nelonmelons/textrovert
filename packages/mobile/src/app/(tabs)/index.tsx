import { ComponentRef, ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { SymbolViewProps } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Chevron, Backdrop, ditto, Eyebrow, fill, fonts, Glass, Icon, PillButton, PressScale, Scallop, Sticker, TAB_BAR_SPACE, Txt, useDesign, Wordmark } from '@/design';
import { Friend, firstName, milestoneDateLine, milestoneHeadline, upcomingMilestones } from '../../people';
import { giftFor } from '../../features/friend/Interests';
import { DeadlineBadge, Face, HedgehogMark } from '../../components/Paper';
import { useDataMode } from '../../api/mode';
import { useFriends, useToday } from '../../api/people';
import { openLiveSource } from '../../api/sources';
import { formatAgo } from '../../lib/answer';
import { useNotes } from '../../store';
import { SearchResults } from '../../components/SearchResults';
import { LiveResults } from '../../components/LiveResults';
import { looksLikeQuestion } from '../../chat';
import { useFirstRun } from '../../firstRun';
import { nativeDriver } from '../../lib/motion';

const openProfile = (friend: Friend) => router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
const openSource = (friend: Friend, message: string) => router.push({ pathname: '/source', params: { friend: friend.id, message, profile: '1' } });

type Mode = 'idle' | 'live' | 'final';

/** A birthday or anniversary coming up, with a gift reminder when there is one. */
type Upcoming = { key: string; friend: Friend; headline: string; detail: string; gift?: string };

const DISMISSED = 'textrovert.dismissedReplies.v1';

/** Replies the user dismissed on this phone, kept across launches. */
function useDismissed() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED)
      .then((raw) => raw && setKeys(new Set(JSON.parse(raw) as string[])))
      .catch(() => {});
  }, []);
  const dismiss = (key: string) =>
    setKeys((prev) => {
      const next = new Set(prev).add(key);
      AsyncStorage.setItem(DISMISSED, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  return { dismissed: keys, dismiss };
}

/** Opens Messages, addressed to the friend when their id is a phone number or email. */
function openIMessage(friend: Friend) {
  const to = /^\+?[\d\s().-]{7,}$/.test(friend.id) ? friend.id.replace(/[^\d+]/g, '') : friend.id.includes('@') ? friend.id : '';
  Linking.openURL(`sms:${to}`).catch(() => {});
}

const dayLine = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

/** One row of the replies or plans card: from GET /today when live, or a note saved on the phone. */
type Item = { key: string; friend: Friend; headline: string; detail?: string; deadline?: Date; open: () => void };


const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * A liquid-glass card under a black sticker label that overlaps its top edge, the way the frontpage labels its
 * sections; an optional pink count and a glass action pill sit on the right.
 */
function Card({ title, accent, count, action, onAction, children }: { title: string; icon?: SymbolViewProps['name']; accent?: string; count?: number; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <View>
      <View style={styles.cardHead}>
        <View style={styles.inline}>
          <Sticker text={title} accent={accent} size={20} />
          {count ? (
            <View style={styles.count}>
              <Txt variant="caption" color="#FFFFFF" style={{ fontSize: 11, letterSpacing: 0 }}>
                {count}
              </Txt>
            </View>
          ) : null}
        </View>
        {action ? <PillButton title={action} small onPress={onAction} /> : null}
      </View>
      <Glass tone="dark" radius={24}>
        <View style={{ padding: 16, paddingTop: 26, gap: 14 }}>{children}</View>
      </Glass>
    </View>
  );
}

function Rows({ children }: { children: ReactNode[] }) {
  const { c } = useDesign();
  return (
    <View>
      {children.map((child, i) => (
        <View key={i}>
          {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginVertical: 12, marginLeft: 66 }} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

function Row({ friend, onPress, children }: { friend: Friend; onPress?: () => void; children: ReactNode }) {
  const { c } = useDesign();
  return (
    <PressScale onPress={onPress ?? (() => openProfile(friend))} scale={0.98} style={styles.row}>
      <Pressable onPress={() => openProfile(friend)} accessibilityLabel={`Open ${firstName(friend)}’s profile`}>
        <Face initials={friend.initials} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
      <Chevron />
    </PressScale>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Txt variant="subhead" tone="secondary">
      {text}
    </Txt>
  );
}

export default function Today() {
  const { c } = useDesign();
  const insets = useSafeAreaInsets();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? '');
  const [mode, setMode] = useState<Mode>(q ? 'final' : 'idle');
  const [photo, setPhoto] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const reveal = useRef(new Animated.Value(q ? 1 : 0)).current;
  const { items } = useNotes();
  const firstRun = useFirstRun();
  const milestones = upcomingMilestones();
  const { live } = useDataMode();
  const people = useFriends();
  const friends = people.friends;
  const recent = [...friends].sort((a, b) => (b.person?.lastAt ?? '').localeCompare(a.person?.lastAt ?? '')).slice(0, 4);
  const day = useToday(live && firstRun.done);
  const { dismissed, dismiss } = useDismissed();
  const upcoming: Upcoming[] = milestones.length
    ? milestones.map((m) => ({
        key: m.id,
        friend: m.friend,
        headline: milestoneHeadline(m),
        detail: milestoneDateLine(m),
        gift: m.kind === 'birthday' ? (items(m.friend, 'gifts')[0]?.title ?? giftFor(m.friend)) : undefined,
      }))
    : [
        ...recent.slice(0, 1).map((f) => ({ key: f.id + '-bday', friend: f, headline: `${firstName(f)}’s birthday is tomorrow`, detail: dayLine(1), gift: giftFor(f) })),
        ...recent.slice(1, 2).map((f) => ({ key: f.id + '-bday', friend: f, headline: `${firstName(f)}’s birthday is in 5 days`, detail: `${dayLine(5)} · Order a gift by ${dayLine(2).split(',')[0]}`, gift: giftFor(f) })),
      ];
  const byName = new Map(friends.map((f) => [f.id, f]));
  const noted = (section: 'reply' | 'plans') =>
    friends.flatMap((friend) =>
      items(friend, section).map((item): Item => ({
        key: friend.id + item.id,
        friend,
        headline: `${item.title} with ${firstName(friend)}`,
        detail: item.detail,
        deadline: item.deadline,
        open: () => (item.sourceID ? openSource(friend, item.sourceID) : openProfile(friend)),
      })),
    );
  const fetched = day.status === 'ready' ? day.today : { replies: [], plans: [] };
  const replies: Item[] = [
    ...fetched.replies.flatMap(({ person, message }) => {
      const friend = byName.get(person);
      return friend ? [{ key: 'reply' + message.messageId, friend, headline: friend.name, detail: `“${message.text}” · ${formatAgo(message.sentAt)}`, open: () => openLiveSource(message) }] : [];
    }),
    ...noted('reply'),
  ];
  const plans: Item[] = [
    ...fetched.plans.flatMap((plan) => {
      const friend = byName.get(plan.person);
      const detail = [plan.when, plan.source.isDm ? null : plan.source.chat].filter(Boolean).join(' · ');
      return friend ? [{ key: 'plan' + plan.source.messageId + plan.what, friend, headline: `${plan.what} with ${firstName(friend)}`, detail, open: () => openLiveSource(plan.source) }] : [];
    }),
    ...noted('plans'),
  ];
  const waiting = replies.filter((item) => !dismissed.has(item.key));
  const pending = live && day.status === 'loading' ? 'Checking your chats…' : live && day.status === 'error' ? `Couldn’t load this. ${day.message}` : null;
  const searching = mode !== 'idle';
  const dock = TAB_BAR_SPACE - 14;

  useEffect(() => {
    if (q === undefined) return;
    setQuery(q);
    setMode(q ? 'final' : 'idle');
  }, [q]);

  useEffect(() => {
    Animated.timing(reveal, { toValue: searching ? 1 : 0, duration: 250, useNativeDriver: nativeDriver }).start();
  }, [searching, reveal]);

  if (!firstRun.done) return <Redirect href="/onboarding" />;

  const startSearch = () => setMode('live');

  const cancel = () => {
    Keyboard.dismiss();
    setQuery('');
    setPhoto(undefined);
    setPhotoError(undefined);
    setMode('idle');
  };

  const pickPhoto = async () => {
    setPhotoError(undefined);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled) {
        setPhoto(result.assets[0].uri);
        setMode('live');
      }
    } catch {
      setPhotoError('That photo couldn’t be loaded. Try another one.');
    }
  };

  const askWithPhoto = () => {
    if (!photo) return;
    router.push({ pathname: '/chat', params: { q: query.trim(), image: photo } });
    cancel();
  };

  const submit = () => {
    if (photo) return askWithPhoto();
    const text = query.trim();
    if (!text) return;
    setMode('final');
    if (looksLikeQuestion(text)) router.push({ pathname: '/chat', params: { q: text } });
  };

  const photoButton = photo ? (
    <Pressable onPress={askWithPhoto} accessibilityLabel="Ask about this photo" style={[styles.round, { backgroundColor: c.accent }]}>
      <Icon name="arrow.up" size={15} />
    </Pressable>
  ) : (
    <Pressable onPress={pickPhoto} accessibilityLabel="Add a photo" hitSlop={8} style={[styles.round, { backgroundColor: 'rgba(255, 255, 255, 0.14)' }]}>
      <Icon name="photo.badge.plus" size={16} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop scene="clouds" />
      <ScrollView keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 12 }}>
        <View style={[styles.header, { paddingHorizontal: 16 }]}>
          <View style={styles.inline}>
            <HedgehogMark height={22} />
            <Wordmark size={24} />
          </View>
          <PressScale onPress={() => router.push('/settings')} accessibilityLabel="Settings" scale={0.94}>
            <Glass tone="light" radius={999}>
              <View style={{ height: 40, paddingHorizontal: 16, justifyContent: 'center' }}>
                <Txt variant="subhead" style={{ fontWeight: '700' }}>
                  Emma
                </Txt>
              </View>
            </Glass>
          </PressScale>
        </View>

        <View style={styles.hero}>
          <Eyebrow text={today()} plain />
          <Txt variant="display" style={styles.heroTitle}>
            {greeting().toLowerCase()}
          </Txt>
          <Txt variant="display" style={styles.heroTitle}>
            emma
          </Txt>
          <Txt variant="callout" shadow style={{ textAlign: 'center', marginTop: 10, opacity: 0.92 }}>
            {waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'person is' : 'people are'} waiting on you.` : 'Here’s who and what matters today.'}
          </Txt>
        </View>

        <View style={[styles.section, { paddingBottom: dock + 96 }]}>

        {people.status === 'loading' ? (
          <Txt variant="subhead" tone="secondary" shadow style={{ paddingHorizontal: 4 }}>
            Loading your people…
          </Txt>
        ) : null}
        {people.status === 'error' ? (
          <Pressable onPress={people.retry}>
            <Glass tone="dark" style={{ padding: 16 }}>
              <Txt variant="subhead">Couldn’t load your people. {people.message} Tap to try again.</Txt>
            </Glass>
          </Pressable>
        ) : null}

        {people.status !== 'ready' ? null : friends.length === 0 ? (
          <Glass tone="dark">
            <View style={{ padding: 24, gap: 10, alignItems: 'center' }}>
              <HedgehogMark height={40} />
              <Txt variant="title2" style={{ textAlign: 'center' }}>
                No people yet
              </Txt>
              <Txt variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
                Your people, replies and plans show up here once your messages are synced.
              </Txt>
            </View>
          </Glass>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <Card title="Coming up" accent="up" count={upcoming.length}>
                <Rows>
                  {upcoming.map((item) => (
                    <Row key={item.key} friend={item.friend}>
                      <Txt variant="headline">{item.headline}</Txt>
                      <Txt variant="subhead" tone="secondary">
                        {item.detail}
                      </Txt>
                      {item.gift ? (
                        <View style={styles.inline}>
                          <Icon name="gift" size={13} color="#F748B1" />
                          <Txt variant="subhead" color="#F748B1" style={{ fontWeight: '600' }}>
                            Gift idea: {item.gift}
                          </Txt>
                        </View>
                      ) : null}
                    </Row>
                  ))}
                </Rows>
              </Card>
            ) : null}

            <Card title="Waiting on your reply" accent="reply" count={waiting.length}>
              {waiting.length === 0 ? (
                <Empty text={pending ?? 'Nothing waiting on you.'} />
              ) : (
                <Rows>
                  {waiting.map((item) => (
                    <Row key={item.key} friend={item.friend} onPress={item.open}>
                      <Txt variant="headline">
                        {item.headline}
                      </Txt>
                      {item.detail ? (
                        <Txt variant="subhead" tone="secondary">
                          {item.detail}
                        </Txt>
                      ) : null}
                      {item.deadline ? <DeadlineBadge deadline={item.deadline} /> : null}
                      <View style={[styles.inline, { gap: 8, marginTop: 6 }]}>
                        <PillButton title="Open iMessage" small kind="primary" icon={<Icon name="message.fill" size={12} color={ditto.navy} />} accessibilityLabel={`Reply to ${firstName(item.friend)} in iMessage`} onPress={() => openIMessage(item.friend)} />
                        <PillButton title="Dismiss" small accessibilityLabel={`Dismiss ${firstName(item.friend)}’s message`} onPress={() => dismiss(item.key)} />
                      </View>
                    </Row>
                  ))}
                </Rows>
              )}
            </Card>

            <Card title="Upcoming plans" accent="plans">
              {plans.length === 0 ? (
                <Empty text={pending ?? 'No plans coming up.'} />
              ) : (
                <Rows>
                  {plans.map((item) => (
                    <Row key={item.key} friend={item.friend} onPress={item.open}>
                      <Txt variant="headline">
                        {item.headline}
                      </Txt>
                      {item.detail ? (
                        <Txt variant="subhead" tone="secondary">
                          {item.detail}
                        </Txt>
                      ) : null}
                    </Row>
                  ))}
                </Rows>
              )}
            </Card>

            <Card title="Your people" accent="people" action="See all" onAction={() => router.navigate('/people')}>
              <Rows>
                {recent.map((friend) => (
                  <Row key={friend.id} friend={friend}>
                    <Txt variant="headline" numberOfLines={1}>
                      {friend.name}
                    </Txt>
                    <Txt variant="subhead" tone="secondary" numberOfLines={1}>
                      {friend.handle}
                    </Txt>
                  </Row>
                ))}
              </Rows>
            </Card>
          </>
        )}

        <PressScale onPress={() => router.navigate('/you')} scale={0.98}>
          <Glass tone="light" radius={24}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Sticker text="Your texting stats" accent="stats" size={18} />
                <Txt variant="title2">{live ? 'Who texts first, and who keeps it going' : 'See your year in texts'}</Txt>
                <Txt variant="subhead" tone="secondary">
                  {live ? 'Reply times, your busiest hours and your closest people.' : 'Import the file from Textrovert on your Mac to see your stats.'}
                </Txt>
              </View>
              <View style={[styles.round, { width: 40, height: 40, borderRadius: 20, backgroundColor: c.key }]}>
                <Icon name="arrow.right" size={16} color={c.keyInk} />
              </View>
            </View>
          </Glass>
        </PressScale>
        </View>
      </ScrollView>

      <View style={[styles.dock, { bottom: dock }]}>
        {photoError && !searching ? (
          <Txt variant="caption" color={c.accentText} shadow style={{ paddingHorizontal: 8, letterSpacing: 0 }}>
            {photoError}
          </Txt>
        ) : null}
        <Glass tone="light" radius={999}>
          <View style={styles.field}>
            <Pressable onPress={startSearch} accessibilityRole="search" accessibilityLabel="Search or ask me anything" style={styles.fieldTap}>
              <Icon name="magnifyingglass" size={17} color={c.textSecondary} />
              <Txt variant="body" color={c.placeholder} style={{ flex: 1 }}>
                Search or ask me anything
              </Txt>
            </Pressable>
            {photoButton}
          </View>
        </Glass>
      </View>

      {searching ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
          <Backdrop scene="clouds" scrim={0.62} />
          <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
            <View style={styles.inline}>
              <View style={[styles.field, styles.topField, { backgroundColor: c.input }]}>
                <Icon name="magnifyingglass" size={16} color={c.textSecondary} />
                <TextInput
                  ref={input}
                  value={query}
                  autoFocus={mode === 'live'}
                  onChangeText={(text) => {
                    setQuery(text);
                    setMode('live');
                  }}
                  onFocus={() => setMode('live')}
                  placeholder={photo ? 'Ask about this photo' : 'Search or ask me anything'}
                  placeholderTextColor={c.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType={photo ? 'send' : 'search'}
                  onSubmitEditing={submit}
                  style={styles.input}
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setQuery('');
                      setMode('live');
                      input.current?.focus();
                    }}
                    accessibilityLabel="Clear search"
                    hitSlop={12}
                  >
                    <Icon name="xmark.circle.fill" size={17} color={c.textTertiary} />
                  </Pressable>
                ) : null}
                {photoButton}
              </View>
              <Pressable onPress={cancel} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Txt variant="body" style={{ fontWeight: '700' }}>
                  Cancel
                </Txt>
              </Pressable>
            </View>
            {photo ? (
              <Glass tone="light" radius={16}>
                <View style={styles.photoChip}>
                  <Image source={{ uri: photo }} style={{ width: 32, height: 32, borderRadius: 8 }} accessibilityLabel="Attached photo" />
                  <Txt variant="subhead" style={{ flex: 1, fontWeight: '700' }}>
                    1 photo · ask me about it
                  </Txt>
                  <Pressable onPress={() => setPhoto(undefined)} accessibilityLabel="Remove photo" hitSlop={10}>
                    <Icon name="xmark.circle.fill" size={18} color={c.textSecondary} />
                  </Pressable>
                </View>
              </Glass>
            ) : null}
            {photoError ? (
              <Txt variant="caption" color={c.accentText} style={{ letterSpacing: 0 }}>
                {photoError}
              </Txt>
            ) : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_SPACE + 24 }}>
            {mode === 'final' ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                <SearchResults query={query} />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                <Glass tone="dark" radius={24} style={{ paddingVertical: 6 }}>
                  <LiveResults query={query} onSearch={submit} />
                </Glass>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: -14, zIndex: 2 },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: '#F748B1', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(8, 16, 34, 0.3)' },
  hero: { alignItems: 'center', gap: 2, paddingTop: 56, paddingBottom: 72, paddingHorizontal: 16 },
  heroTitle: { textAlign: 'center', fontSize: 58, lineHeight: 56 },
  section: { paddingHorizontal: 16, paddingTop: 8, gap: 26 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dock: { position: 'absolute', left: 16, right: 16, gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingLeft: 18, paddingRight: 8, borderRadius: 999 },
  fieldTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  topBar: { gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  topField: { flex: 1, minHeight: 46, paddingLeft: 16 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 16, fontFamily: fonts.ui, paddingVertical: 10, outlineStyle: 'none' } as object,
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  photoChip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingRight: 12, paddingVertical: 6 },
});
