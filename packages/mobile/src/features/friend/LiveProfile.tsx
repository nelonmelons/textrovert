import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolViewProps } from 'expo-symbols';
import { fetchFriend, fetchStory, type FriendFact, type FriendProfile, type Story } from '../../api/friend';
import { chatLabel, type Source } from '../../api/client';
import { openLiveSource } from '../../api/sources';
import { art, Divider, RowChevron, SectionCard, Symbol, ToneTab } from '../../components/Paper';
import { ReelButton } from '../reels/ReelButton';
import { FriendStatsCard } from '../stats/FriendStatsCard';
import { router } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { formatAgo } from '../../lib/answer';
import { Theme, Tone, Type, withAlpha } from '../../theme';

const predicateLabel: Record<string, string> = {
  likes: 'Likes',
  dislikes: 'Not a fan of',
  wants: 'Wants',
  'works at': 'Works at',
  studies: 'Studies',
  'lives in': 'Lives in',
  relationship: 'Relationship',
  milestone: 'Milestone',
  habit: 'Habit',
};

const SHOWN_FACTS = 8;
const SHOWN_EPISODES = 5;

const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const open = (source: Source, quote?: string) => {
  haptics.select();
  openLiveSource(source, quote);
};

type State = { status: 'loading' } | { status: 'ready'; profile: FriendProfile } | { status: 'error'; message: string };

/** The live half of a friend's profile: facts, plans, recent moments, topics and the story of us, from GET /friend. */
export function useFriendProfile(name: string) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fetchFriend(name).then(
      (profile) => live && setState({ status: 'ready', profile }),
      (e: Error) => live && setState({ status: 'error', message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [name, attempt]);
  return { state, retry: () => setAttempt((a) => a + 1) };
}

function Row({ onPress, children, label }: { onPress: () => void; children: React.ReactNode; label?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={{ flex: 1, gap: 3 }}>{children}</View>
      <RowChevron />
    </Pressable>
  );
}

function Card({ title, symbol, tone, children }: { title: string; symbol: SymbolViewProps['name']; tone: Tone; children: React.ReactNode }) {
  return (
    <SectionCard tone={tone}>
      <View style={{ gap: 10 }}>
        <ToneTab title={title} symbol={symbol} tone={tone} />
        {children}
      </View>
    </SectionCard>
  );
}

const Meta = ({ text }: { text: string }) => <Text style={[Type.caption, { color: Theme.secondary }]}>{text}</Text>;

function Facts({ facts }: { facts: FriendFact[] }) {
  const [all, setAll] = useState(false);
  const current = [...facts.filter((f) => !f.validTo), ...facts.filter((f) => f.validTo)];
  const shown = all ? current : current.slice(0, SHOWN_FACTS);
  return (
    <Card title="What you know" symbol="sparkles" tone={Theme.accentTone}>
      {shown.map((f, i) => (
        <View key={f.messageId + f.predicate + f.object} style={{ gap: 10 }}>
          {i > 0 ? <Divider /> : null}
          <Row onPress={() => open(f.source, f.quote)} label={`${predicateLabel[f.predicate] ?? f.predicate} ${f.object}. Show the message`}>
            <Text style={[Type.caption, { color: Theme.accentTone.ink, fontWeight: '700' }]}>{(predicateLabel[f.predicate] ?? f.predicate).toUpperCase()}</Text>
            <Text style={[Type.subheadline, { color: f.validTo ? Theme.secondary : Theme.ink, fontWeight: '600' }]}>{f.object}</Text>
            <Meta text={(f.validTo ? 'Used to be · ' : '') + chatLabel(f.source) + ' · ' + formatAgo(f.validFrom)} />
          </Row>
        </View>
      ))}
      {current.length > SHOWN_FACTS ? (
        <Pressable onPress={() => setAll((a) => !a)} hitSlop={8}>
          <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>{all ? 'Show fewer' : `Show all ${current.length}`}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** The "story of us": a memoir in chapters, each sentence footnoted to the messages behind it. */
function StoryCard({ name, first, initial }: { name: string; first: string; initial: Story | null }) {
  const [story, setStory] = useState(initial);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState<string>();
  const write = async () => {
    haptics.impact('light');
    setWriting(true);
    setNote(undefined);
    try {
      const next = await fetchStory(name);
      setStory(next);
      if (!next) setNote(`There isn’t enough between you and ${first} to write about yet.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(false);
    }
  };
  return (
    <Card title="Story of us" symbol="book.closed.fill" tone={Theme.celebrateTone}>
      {story ? (
        <View style={{ gap: 14 }}>
          <Text style={[Type.title3, { color: Theme.ink, fontWeight: '700' }]}>{story.headline}</Text>
          {story.chapters.map((chapter) => (
            <View key={chapter.title} style={{ gap: 6 }}>
              <Text style={[Type.headline, { color: Theme.celebrateTone.ink }]}>{chapter.title}</Text>
              <Meta text={chapter.period} />
              <Text style={[Type.callout, { color: Theme.ink }]}>
                {chapter.sentences.map((s) => {
                  const source = s.refs.map((r) => story.sources[String(r)]).find(Boolean);
                  return (
                    <Text key={s.n}>
                      {s.text}
                      {source ? (
                        <Text accessibilityRole="button" accessibilityLabel={`Footnote ${s.n}`} onPress={() => open(source)} style={styles.footnote}>
                          {' '}
                          {s.n}
                        </Text>
                      ) : null}{' '}
                    </Text>
                  );
                })}
              </Text>
            </View>
          ))}
          <Meta text={`Written ${formatAgo(story.writtenAt)} from your chats. Tap a number to see the message.`} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={[Type.subheadline, { color: Theme.ink }]}>A short memoir of you and {first}, written from your chats, with every line footnoted.</Text>
          {writing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={Theme.celebrateTone.ink} />
              <Text style={[Type.footnote, { color: Theme.secondary }]}>Writing it. This takes up to half a minute.</Text>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={write} style={({ pressed }) => [styles.pill, { backgroundColor: Theme.celebrateTone.ink }, pressed && { opacity: 0.8 }]}>
              <Symbol name="pencil.and.outline" size={14} color="#FFFFFF" weight="semibold" />
              <Text style={[Type.subheadline, { color: '#FFFFFF', fontWeight: '600' }]}>Write our story</Text>
            </Pressable>
          )}
          {note ? <Text style={[Type.footnote, { color: Theme.secondary }]}>{note}</Text> : null}
        </View>
      )}
    </Card>
  );
}

export function LiveProfile({ name, first, state, retry }: { name: string; first: string; state: State; retry: () => void }) {
  if (state.status === 'loading')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <ActivityIndicator color={Theme.accent} />
        <Text style={[Type.subheadline, { color: Theme.secondary }]}>Reading your chats with {first}…</Text>
      </View>
    );
  if (state.status === 'error')
    return (
      <SectionCard tone={Theme.coralTone}>
        <View style={{ gap: 8 }}>
          <Text style={[Type.headline, { color: Theme.ink }]}>Couldn’t load what your chats say about {first}.</Text>
          <Text style={[Type.subheadline, { color: Theme.secondary }]}>{state.message}</Text>
          <Pressable onPress={retry} hitSlop={8}>
            <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Try again</Text>
          </Pressable>
        </View>
      </SectionCard>
    );
  const p = state.profile;
  const quiet = p.facts.length === 0 && p.plans.length === 0 && p.episodes.length === 0;
  return (
    <View style={{ gap: 18 }}>
      {p.topics.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={[Type.footnote, { color: Theme.secondary, fontWeight: '600' }]}>You two talk about · tap one to see it on your map</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {p.topics.slice(0, 8).map((t) => (
              <Pressable
                key={t.topic}
                accessibilityRole="button"
                accessibilityLabel={`${t.topic}: show it in your topics`}
                onPress={() => {
                  haptics.select();
                  router.push({ pathname: '/portrait', params: { view: 'atlas/t/' + encodeURIComponent(t.topic) } });
                }}
                style={({ pressed }) => [styles.topic, pressed && { opacity: 0.7 }]}
              >
                <Text style={[Type.subheadline, { color: Theme.activitiesTone.ink, fontWeight: '500' }]}>{t.topic}</Text>
                <Symbol name="map" size={11} color={Theme.activitiesTone.ink} weight="semibold" />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {p.stats ? <FriendStatsCard stats={p.stats} first={first} /> : null}
      {quiet ? (
        <SectionCard tone={Theme.activitiesTone}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={art.leaf} style={{ width: 64, height: 64 }} resizeMode="contain" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[Type.headline, { color: Theme.ink }]}>Still getting to know {first}</Text>
              <Text style={[Type.subheadline, { color: Theme.secondary }]}>
                Your chats haven’t mentioned plans or details about {first} yet. They’ll show up here as you talk, each with the message it came from.
              </Text>
            </View>
          </View>
        </SectionCard>
      ) : null}
      {p.facts.length > 0 ? <Facts facts={p.facts} /> : null}
      {p.plans.length > 0 ? (
        <Card title="Plans from your chats" symbol="calendar" tone={Theme.plansTone}>
          {p.plans.slice(0, 6).map((plan, i) => (
            <View key={plan.episodeId + plan.what} style={{ gap: 10 }}>
              {i > 0 ? <Divider /> : null}
              <Row onPress={() => open(plan.source)}>
                <Text style={[Type.subheadline, { color: Theme.ink, fontWeight: '600' }]}>{plan.what}</Text>
                <Meta text={[plan.when, chatLabel(plan.source)].filter(Boolean).join(' · ')} />
              </Row>
            </View>
          ))}
        </Card>
      ) : null}
      {p.episodes.length > 0 ? (
        <Card title="Recent moments" symbol="bubble.left.and.bubble.right.fill" tone={Theme.repliesTone}>
          {p.episodes.slice(0, SHOWN_EPISODES).map((e, i) => (
            <View key={e.id} style={{ gap: 10 }}>
              {i > 0 ? <Divider /> : null}
              <Row onPress={() => open(e.source)}>
                <Text style={[Type.subheadline, { color: Theme.ink, fontWeight: '600' }]}>{e.title}</Text>
                <Text style={[Type.footnote, { color: Theme.ink }]} numberOfLines={3}>
                  {e.summary}
                </Text>
                <Meta text={[monthYear(e.start), e.isDm ? 'Your DM' : e.chat, e.messageCount + ' messages'].join(' · ')} />
              </Row>
              <ReelButton episodeId={e.id} />
            </View>
          ))}
        </Card>
      ) : null}
      {quiet ? null : <StoryCard name={name} first={first} initial={p.story} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  pressed: { backgroundColor: withAlpha(Theme.accentTone.fill, 0.6), opacity: 0.75, borderRadius: 12 },
  footnote: { color: Theme.celebrateTone.ink, fontWeight: '800', fontSize: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingHorizontal: 16, minHeight: 40, borderRadius: 20 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: Theme.activitiesTone.fill },
});
