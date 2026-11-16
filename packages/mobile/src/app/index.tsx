import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rounded, Theme, Type } from '../theme';
import { Friend, firstName, friends, upcomingMilestones } from '../people';
import { art, DeadlineBadge, Divider, Face, GridPaper, HedgehogMark, RowChevron, SectionCard, Symbol, ToneTab } from '../components/Paper';
import { MilestoneRow } from '../components/MilestoneRow';
import { useNotes } from '../store';
import { SearchResults } from '../components/SearchResults';
import { LiveResults } from '../components/LiveResults';
import { looksLikeQuestion } from '../chat';
import { useFirstRun } from '../firstRun';

const openProfile = (friend: Friend) => router.push(`/friend/${friend.id}`);
const openSource = (friend: Friend, message: string) => router.push({ pathname: '/source', params: { friend: friend.id, message, profile: '1' } });

type Mode = 'idle' | 'live' | 'final';

function Row({ friend, source, children }: { friend: Friend; source?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Pressable onPress={() => openProfile(friend)} accessibilityLabel={`Open ${firstName(friend)}’s profile`}>
        <Face initials={friend.initials} />
      </Pressable>
      <Pressable onPress={() => (source ? openSource(friend, source) : openProfile(friend))} style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}>
        <View style={{ flex: 1, gap: 6 }}>{children}</View>
        <RowChevron />
      </Pressable>
    </View>
  );
}

export default function Today() {
  const insets = useSafeAreaInsets();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? '');
  const [mode, setMode] = useState<Mode>(q ? 'final' : 'idle');
  const [photo, setPhoto] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();
  const [panelHeight, setPanelHeight] = useState(100);
  const [contentSize, setContentSize] = useState({ width: 440, height: 1200 });
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const reveal = useRef(new Animated.Value(q ? 1 : 0)).current;
  const { items } = useNotes();
  const firstRun = useFirstRun();
  const milestones = upcomingMilestones();
  const replies = friends.flatMap((friend) => items(friend, 'reply').map((item) => ({ friend, item })));
  const plans = friends.flatMap((friend) => items(friend, 'plans').map((item) => ({ friend, item })));
  const searching = mode !== 'idle';

  useEffect(() => {
    if (q === undefined) return;
    setQuery(q);
    setMode(q ? 'final' : 'idle');
  }, [q]);

  useEffect(() => {
    Animated.timing(reveal, { toValue: searching ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [searching, reveal]);

  if (!firstRun.done) return <Redirect href="/setup" />;

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
    <Pressable onPress={askWithPhoto} accessibilityLabel="Ask about this photo" style={styles.send}>
      <Symbol name="arrow.up" size={15} color="#FFFFFF" weight="bold" />
    </Pressable>
  ) : (
    <Pressable onPress={pickPhoto} accessibilityLabel="Add a photo" hitSlop={8} style={styles.photoButton}>
      <Symbol name="photo.badge.plus" size={19} color={Theme.accent} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Theme.paper }}>
      <ScrollView
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 24, paddingBottom: panelHeight + 40 }}
        onContentSizeChange={(width, height) => setContentSize({ width, height })}
      >
        <GridPaper width={contentSize.width} height={contentSize.height + 800} />
        <View style={{ gap: 24 }}>
          <View style={styles.header}>
            <View style={styles.inlineWide}>
              <HedgehogMark height={30} />
              <Text style={[Type.title2, { fontFamily: Rounded.heavy, color: Theme.accent }]}>textrovert</Text>
            </View>
            <Pressable accessibilityLabel="Emma, Settings" onPress={() => router.push('/settings')}>
              <Face initials="ED" />
            </Pressable>
          </View>

          <View style={{ gap: 22 }}>
            <Text style={[Type.largeTitle, { fontFamily: Rounded.bold, color: Theme.ink }]}>Today</Text>

            {friends.length === 0 ? (
              <SectionCard tone={Theme.accentTone}>
                <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <Image source={art.bird} style={{ width: 220, height: 150 }} resizeMode="contain" />
                  <Text style={[Type.title3, { fontFamily: Rounded.bold, color: Theme.ink, textAlign: 'center' }]}>No people yet</Text>
                  <Text style={[Type.body, styles.secondary, { textAlign: 'center' }]}>
                    Your people, replies and plans show up here once your messages are synced.
                  </Text>
                </View>
              </SectionCard>
            ) : (
              <>
                <SectionCard tone={Theme.repliesTone}>
                  <View style={{ gap: 14 }}>
                    <ToneTab title="Waiting on your reply" symbol="arrowshape.turn.up.left.fill" tone={Theme.repliesTone} />
                    {replies.length === 0 ? <Text style={[Type.subheadline, styles.secondary]}>Nothing waiting on you.</Text> : null}
                    {replies.map(({ friend, item }, index) => (
                      <View key={friend.id + item.id} style={{ gap: 14 }}>
                        {index > 0 ? <Divider /> : null}
                        <Row friend={friend} source={item.sourceID}>
                          <Text style={[Type.headline, styles.ink]}>
                            {item.title} with {firstName(friend)}
                          </Text>
                          {item.detail ? <Text style={[Type.subheadline, styles.secondary]}>{item.detail}</Text> : null}
                          {item.deadline ? <DeadlineBadge deadline={item.deadline} /> : null}
                        </Row>
                      </View>
                    ))}
                  </View>
                </SectionCard>

                {milestones.length > 0 ? (
                  <SectionCard tone={Theme.celebrateTone} fillOpacity={0.55}>
                    <View style={{ gap: 14 }}>
                      <View style={[styles.header, { alignItems: 'flex-start' }]}>
                        <ToneTab title="Coming up" symbol="sparkles" tone={Theme.celebrateTone} />
                        <Image source={art.toast} style={{ height: 44, width: 88 }} resizeMode="contain" />
                      </View>
                      {milestones.map((milestone, index) => (
                        <View key={milestone.id} style={{ gap: 14 }}>
                          {index > 0 ? <Divider /> : null}
                          <Pressable onPress={() => openProfile(milestone.friend)} style={({ pressed }) => [{ paddingVertical: 4 }, pressed && styles.pressed]}>
                            <MilestoneRow milestone={milestone} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </SectionCard>
                ) : null}

                <SectionCard tone={Theme.plansTone}>
                  <View style={{ gap: 14 }}>
                    <ToneTab title="Upcoming plans" symbol="calendar" tone={Theme.plansTone} />
                    {plans.length === 0 ? <Text style={[Type.subheadline, styles.secondary]}>No plans yet.</Text> : null}
                    {plans.map(({ friend, item }, index) => (
                      <View key={friend.id + item.id} style={{ gap: 14 }}>
                        {index > 0 ? <Divider /> : null}
                        <Row friend={friend} source={item.sourceID}>
                          <Text style={[Type.headline, styles.ink]}>
                            {item.title} with {firstName(friend)}
                          </Text>
                          {item.detail ? <Text style={[Type.subheadline, styles.secondary, { marginTop: -2 }]}>{item.detail}</Text> : null}
                        </Row>
                      </View>
                    ))}
                  </View>
                </SectionCard>
              </>
            )}
          </View>
        </View>
      </ScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: Theme.paper }} />

      <View style={[styles.panel, { paddingBottom: insets.bottom + 6 }]} onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}>
        {photoError && !searching ? <Text style={[Type.caption, { color: Theme.deadline, paddingHorizontal: 4 }]}>{photoError}</Text> : null}
        <View style={styles.field}>
          <Pressable onPress={startSearch} accessibilityRole="search" accessibilityLabel="Search or ask me anything" style={styles.fieldTap}>
            <View style={styles.searchIcon}>
              <Symbol name="magnifyingglass" size={16} color={Theme.accent} weight="bold" />
            </View>
            <Text style={[Type.body, { flex: 1, color: Theme.secondary }]}>Search or ask me anything</Text>
          </Pressable>
          {photoButton}
        </View>
      </View>

      {searching ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: Theme.paper, opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }] },
          ]}
        >
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={styles.inlineWide}>
              <View style={[styles.field, styles.topField]}>
                <Symbol name="magnifyingglass" size={16} color={Theme.accent} weight="bold" />
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
                  placeholderTextColor={Theme.secondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType={photo ? 'send' : 'search'}
                  onSubmitEditing={submit}
                  style={[Type.body, { flex: 1, color: Theme.ink, paddingVertical: 10 }]}
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
                    <Symbol name="xmark.circle.fill" size={17} color={Theme.secondary} />
                  </Pressable>
                ) : null}
                {photoButton}
              </View>
              <Pressable onPress={cancel} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={[Type.body, { color: Theme.ink, fontWeight: '600' }]}>Cancel</Text>
              </Pressable>
            </View>
            {photo ? (
              <View style={styles.photoChip}>
                <Image source={{ uri: photo }} style={{ width: 32, height: 32, borderRadius: 8 }} accessibilityLabel="Attached photo" />
                <Text style={[Type.subheadline, { flex: 1, color: Theme.ink, fontWeight: '600' }]}>1 photo · ask me about it</Text>
                <Pressable onPress={() => setPhoto(undefined)} accessibilityLabel="Remove photo" hitSlop={10}>
                  <Symbol name="xmark.circle.fill" size={18} color={Theme.secondary} />
                </Pressable>
              </View>
            ) : null}
            {photoError ? <Text style={[Type.caption, { color: Theme.deadline }]}>{photoError}</Text> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            {mode === 'final' ? (
              <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
                <SearchResults query={query} />
              </View>
            ) : (
              <LiveResults query={query} onSearch={submit} />
            )}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ink: { color: Theme.ink },
  secondary: { color: Theme.secondary },
  pressed: { backgroundColor: 'rgba(244, 227, 226, 0.6)', opacity: 0.75, borderRadius: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineWide: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: Theme.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: Theme.accent,
    backgroundColor: Theme.background,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fieldTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
  topBar: { gap: 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Theme.separator, backgroundColor: Theme.paper },
  topField: { flex: 1, minHeight: 46, paddingLeft: 14, gap: 10, borderRadius: 23, shadowOpacity: 0 },
  searchIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  photoButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.accentTone.fill },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.accent },
  photoChip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: 14, backgroundColor: Theme.plansTone.fill },
});
