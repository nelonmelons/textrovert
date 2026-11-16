import { ComponentRef, ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Image, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { SymbolViewProps } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Chevron, Backdrop, ditto, Eyebrow, fill, fonts, Glass, Icon, PillButton, PressScale, Scallop, Sticker, TAB_BAR_SPACE, Txt, useDesign, Wordmark } from '@/design';
import { Friend, firstName, upcomingMilestones } from '../../people';
import { DeadlineBadge, Face, HedgehogMark } from '../../components/Paper';
import { useDataMode } from '../../api/mode';
import { useFriends } from '../../api/people';
import { MilestoneRow } from '../../components/MilestoneRow';
import { useNotes } from '../../store';
import { SearchResults } from '../../components/SearchResults';
import { LiveResults } from '../../components/LiveResults';
import { looksLikeQuestion } from '../../chat';
import { useFirstRun } from '../../firstRun';
import { nativeDriver } from '../../lib/motion';

const openProfile = (friend: Friend) => router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
const openSource = (friend: Friend, message: string) => router.push({ pathname: '/source', params: { friend: friend.id, message, profile: '1' } });

type Mode = 'idle' | 'live' | 'final';

/** The content section's deep blue (the frontpage's duotone sections), and the grain it carries. */
const SECTION_TOP = '#1B4384';
const grain = require('../../../assets/ditto/noise.png');

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

function Row({ friend, source, children }: { friend: Friend; source?: string; children: ReactNode }) {
  const { c } = useDesign();
  return (
    <PressScale onPress={() => (source ? openSource(friend, source) : openProfile(friend))} scale={0.98} style={styles.row}>
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
  const replies = friends.flatMap((friend) => items(friend, 'reply').map((item) => ({ friend, item })));
  const plans = friends.flatMap((friend) => items(friend, 'plans').map((item) => ({ friend, item })));
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
          <Txt variant="script" style={{ fontSize: 40, lineHeight: 44, marginTop: -6 }}>
            @emma
          </Txt>
          <Txt variant="callout" shadow style={{ textAlign: 'center', marginTop: 10, opacity: 0.92 }}>
            {replies.length ? `${replies.length} ${replies.length === 1 ? 'person is' : 'people are'} waiting on you.` : 'Here’s who and what matters today.'}
          </Txt>
        </View>

        <Scallop color={SECTION_TOP} />
        <View style={[styles.section, { paddingBottom: dock + 96 }]}>
          <LinearGradient pointerEvents="none" colors={[SECTION_TOP, '#0F2B60', '#0B1A33']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
          <Image source={grain} resizeMode="repeat" pointerEvents="none" style={[fill, { opacity: 0.45 }]} />

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
            <Card title="Waiting on your reply" accent="reply" count={replies.length}>
              {replies.length === 0 ? (
                <Empty text="Nothing waiting on you." />
              ) : (
                <Rows>
                  {replies.map(({ friend, item }) => (
                    <Row key={friend.id + item.id} friend={friend} source={item.sourceID}>
                      <Txt variant="headline">
                        {item.title} with {firstName(friend)}
                      </Txt>
                      {item.detail ? (
                        <Txt variant="subhead" tone="secondary">
                          {item.detail}
                        </Txt>
                      ) : null}
                      {item.deadline ? <DeadlineBadge deadline={item.deadline} /> : null}
                    </Row>
                  ))}
                </Rows>
              )}
            </Card>

            {milestones.length > 0 ? (
              <Card title="Coming up" accent="up">
                <Rows>
                  {milestones.map((milestone) => (
                    <PressScale key={milestone.id} onPress={() => openProfile(milestone.friend)} scale={0.98}>
                      <MilestoneRow milestone={milestone} />
                    </PressScale>
                  ))}
                </Rows>
              </Card>
            ) : null}

            <Card title="Upcoming plans" accent="plans">
              {plans.length === 0 ? (
                <Empty text="No plans yet." />
              ) : (
                <Rows>
                  {plans.map(({ friend, item }) => (
                    <Row key={friend.id + item.id} friend={friend} source={item.sourceID}>
                      <Txt variant="headline">
                        {item.title} with {firstName(friend)}
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
        <Glass tone="navy" radius={999} style={{ boxShadow: '0px 12px 30px rgba(12, 34, 80, 0.28)' }}>
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
  section: { backgroundColor: '#0F2B60', paddingHorizontal: 16, paddingTop: 30, gap: 26 },
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
