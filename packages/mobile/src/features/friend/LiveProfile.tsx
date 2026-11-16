import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SymbolViewProps } from 'expo-symbols';
import { fetchFriend, fetchStory, type FriendFact, type FriendProfile, type Story } from '../../api/friend';
import { chatLabel, type Source } from '../../api/client';
import { openLiveSource } from '../../api/sources';
import { Chip, Eyebrow, Glass, Icon, PillButton, PressScale, space, Txt } from '@/design';
import { ProfileCard } from './ProfileCard';

export { ProfileCard };
import { ReelButton } from '../reels/ReelButton';
import { FriendStatsCard } from '../stats/FriendStatsCard';
import { router } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { formatAgo } from '../../lib/answer';
import { Theme, Type } from '../../theme';

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

function Row({ onPress, children, label }: { onPress: () => void; children: ReactNode; label?: string }) {
  return (
    <PressScale scale={0.985} accessibilityLabel={label} onPress={onPress} style={styles.row}>
      <View style={{ flex: 1, gap: 3 }}>{children}</View>
      <Icon name="chevron.right" size={12} color="rgba(255, 255, 255, 0.45)" />
    </PressScale>
  );
}

const Hairline = () => <View style={{ height: 0.5, backgroundColor: 'rgba(255, 255, 255, 0.12)' }} />;

const Meta = ({ text }: { text: string }) => (
  <Txt variant="footnote" tone="tertiary">
    {text}
  </Txt>
);

function Facts({ facts }: { facts: FriendFact[] }) {
  const [all, setAll] = useState(false);
  const current = [...facts.filter((f) => !f.validTo), ...facts.filter((f) => f.validTo)];
  const shown = all ? current : current.slice(0, SHOWN_FACTS);
  return (
    <ProfileCard title="What you know" symbol="sparkles" tint={Theme.accentTone.ink}>
      {shown.map((f, i) => (
        <View key={f.messageId + f.predicate + f.object} style={{ gap: space.sm }}>
          {i > 0 ? <Hairline /> : null}
          <Row onPress={() => open(f.source, f.quote)} label={`${predicateLabel[f.predicate] ?? f.predicate} ${f.object}. Show the message`}>
            <Txt variant="caption" color={Theme.accentTone.ink} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              {predicateLabel[f.predicate] ?? f.predicate}
            </Txt>
            <Txt variant="callout" tone={f.validTo ? 'secondary' : 'primary'} style={{ fontWeight: '700' }}>
              {f.object}
            </Txt>
            <Meta text={(f.validTo ? 'Used to be · ' : '') + chatLabel(f.source) + ' · ' + formatAgo(f.validFrom)} />
          </Row>
        </View>
      ))}
      {current.length > SHOWN_FACTS ? <PillButton small title={all ? 'Show fewer' : `Show all ${current.length}`} onPress={() => setAll((a) => !a)} /> : null}
    </ProfileCard>
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
    <ProfileCard title="Story of us" symbol="book.closed.fill" tint={Theme.celebrateTone.ink}>
      {story ? (
        <View style={{ gap: space.lg }}>
          <Txt variant="title2">{story.headline}</Txt>
          {story.chapters.map((chapter) => (
            <View key={chapter.title} style={{ gap: 6 }}>
              <Txt variant="headline" color={Theme.celebrateTone.ink}>
                {chapter.title}
              </Txt>
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
        <View style={{ gap: space.md }}>
          <Txt variant="callout">A short memoir of you and {first}, written from your chats, with every line footnoted.</Txt>
          {writing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Txt variant="footnote" tone="secondary">
                Writing it. This takes up to half a minute.
              </Txt>
            </View>
          ) : (
            <PillButton kind="primary" title="Write our story" icon={<Icon name="pencil.and.outline" size={14} color="#FF2CAB" />} onPress={write} />
          )}
          {note ? (
            <Txt variant="footnote" tone="secondary">
              {note}
            </Txt>
          ) : null}
        </View>
      )}
    </ProfileCard>
  );
}

export function LiveProfile({ name, first, state, retry }: { name: string; first: string; state: State; retry: () => void }) {
  if (state.status === 'loading')
    return (
      <Glass tone="dark" radius={24} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}>
        <ActivityIndicator color="#FFFFFF" />
        <Txt variant="subhead" tone="secondary">
          Reading your chats with {first}…
        </Txt>
      </Glass>
    );
  if (state.status === 'error')
    return (
      <Glass tone="dark" radius={24} style={{ padding: space.lg, gap: space.sm }}>
        <Txt variant="headline">Couldn’t load what your chats say about {first}.</Txt>
        <Txt variant="subhead" tone="secondary">
          {state.message}
        </Txt>
        <View style={{ marginTop: space.xs }}>
          <PillButton title="Try again" kind="primary" small onPress={retry} />
        </View>
      </Glass>
    );
  const p = state.profile;
  const quiet = p.facts.length === 0 && p.plans.length === 0 && p.episodes.length === 0;
  return (
    <View style={{ gap: space.lg }}>
      {p.topics.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <View style={{ paddingHorizontal: space.xs, gap: 2 }}>
            <Eyebrow text="You two talk about" />
            <Txt variant="footnote" tone="secondary" shadow>
              Tap one to find it on your map
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {p.topics.slice(0, 8).map((t) => (
              <Chip
                key={t.topic}
                label={t.topic}
                accessibilityLabel={`${t.topic}: show it in your topics`}
                onPress={() => {
                  haptics.select();
                  router.push({ pathname: '/portrait', params: { view: 'atlas/t/' + encodeURIComponent(t.topic) } });
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      {p.stats ? <FriendStatsCard stats={p.stats} first={first} /> : null}
      {quiet ? (
        <Glass tone="dark" radius={24} style={{ padding: space.lg, gap: space.xs }}>
          <Txt variant="title2">Still getting to know {first}</Txt>
          <Txt variant="subhead" tone="secondary">
            Your chats haven’t mentioned plans or details about {first} yet. They’ll show up here as you talk, each with the message it came from.
          </Txt>
        </Glass>
      ) : null}
      {p.facts.length > 0 ? <Facts facts={p.facts} /> : null}
      {p.plans.length > 0 ? (
        <ProfileCard title="Plans from your chats" symbol="calendar" tint={Theme.plansTone.ink}>
          {p.plans.slice(0, 6).map((plan, i) => (
            <View key={plan.episodeId + plan.what} style={{ gap: space.sm }}>
              {i > 0 ? <Hairline /> : null}
              <Row onPress={() => open(plan.source)}>
                <Txt variant="callout" style={{ fontWeight: '700' }}>
                  {plan.what}
                </Txt>
                <Meta text={[plan.when, chatLabel(plan.source)].filter(Boolean).join(' · ')} />
              </Row>
            </View>
          ))}
        </ProfileCard>
      ) : null}
      {p.episodes.length > 0 ? (
        <ProfileCard title="Recent moments" symbol="bubble.left.and.bubble.right.fill" tint={Theme.repliesTone.ink}>
          {p.episodes.slice(0, SHOWN_EPISODES).map((e, i) => (
            <View key={e.id} style={{ gap: space.sm }}>
              {i > 0 ? <Hairline /> : null}
              <Row onPress={() => open(e.source)}>
                <Txt variant="callout" style={{ fontWeight: '700' }}>
                  {e.title}
                </Txt>
                <Txt variant="subhead" tone="secondary" numberOfLines={3}>
                  {e.summary}
                </Txt>
                <Meta text={[monthYear(e.start), e.isDm ? 'Your DM' : e.chat, e.messageCount + ' messages'].join(' · ')} />
              </Row>
              <ReelButton episodeId={e.id} />
            </View>
          ))}
        </ProfileCard>
      ) : null}
      {quiet ? null : <StoryCard name={name} first={first} initial={p.story} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  footnote: { color: '#FF7BCB', fontWeight: '700', fontSize: 12 },
});
