import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { AppIconTile, BigButton, Chip, EmojiAvatar, fillFor, ListRow, ListSection, PillButton, SectionTitle, space, Txt, useDesign, type FillName } from '@/design';
import { fetchFriend, fetchStory, type FriendFact, type FriendProfile, type Story } from '../../api/friend';
import { chatLabel, type Source } from '../../api/client';
import { openLiveSource } from '../../api/sources';
import { ReelButton } from '../reels/ReelButton';
import { emojiFor } from '../stats/Topics';
import { FriendStats } from './FriendStats';
import { haptics } from '../../lib/haptics';
import { formatAgo } from '../../lib/answer';

const SLEEPY = require('../../../assets/art/hedgehog-sleepy.png');
const GHOST = require('../../../assets/art/hedgehog-ghost.png');
const WAVE = require('../../../assets/art/hedgehog-wave.png');
const DETECTIVE = require('../../../assets/art/hedgehog-detective.png');

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

const predicateEmoji: Record<string, [string, FillName]> = {
  likes: ['❤️', 'pink'],
  dislikes: ['🙅', 'coral'],
  wants: ['✨', 'yellow'],
  'works at': ['💼', 'peach'],
  studies: ['📚', 'lilac'],
  'lives in': ['📍', 'mint'],
  relationship: ['💞', 'pink'],
  milestone: ['🎉', 'yellow'],
  habit: ['🔁', 'lime'],
};

const SHOWN_FACTS = 8;
const SHOWN_EPISODES = 5;

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);
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

/** A hedgehog beside a line of copy, in a plain card: loading, empty and error states. */
function Callout({ art, title, text, children }: { art: number; title?: string; text: string; children?: React.ReactNode }) {
  return (
    <ListSection>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}>
        <Image source={art} resizeMode="contain" style={{ width: 72, height: 72 }} aria-hidden />
        <View style={{ flex: 1, gap: space.xs, alignItems: 'flex-start' }}>
          {title ? <Txt variant="headline">{title}</Txt> : null}
          <Txt variant="subhead" tone="secondary">
            {text}
          </Txt>
          {children}
        </View>
      </View>
    </ListSection>
  );
}

function Facts({ facts }: { facts: FriendFact[] }) {
  const [all, setAll] = useState(false);
  const current = [...facts.filter((f) => !f.validTo), ...facts.filter((f) => f.validTo)];
  const shown = all ? current : current.slice(0, SHOWN_FACTS);
  const rows = shown.map((f) => {
    const label = predicateLabel[f.predicate] ?? f.predicate;
    const [emoji, color] = predicateEmoji[f.predicate] ?? ['💡', 'lilac'];
    return (
      <ListRow
        key={f.messageId + f.predicate + f.object}
        wrap
        title={f.object}
        subtitle={(f.validTo ? 'Used to · ' : '') + label + ' · ' + chatLabel(f.source) + ' · ' + formatAgo(f.validFrom)}
        accessibilityLabel={label + ' ' + f.object + '. Show the message'}
        leading={<EmojiAvatar emoji={emoji} color={color} size={36} />}
        onPress={() => open(f.source, f.quote)}
      />
    );
  });
  if (current.length > SHOWN_FACTS)
    rows.push(<ListRow key="more" title={all ? 'Show fewer' : 'Show all ' + current.length} leading={<EmojiAvatar emoji={all ? '🔼' : '🔽'} color="white" size={36} />} chevron={false} onPress={() => setAll((a) => !a)} />);
  return (
    <ListSection header="Likes, wants and the rest" footer="Each one from a message. Tap to see it.">
      {rows}
    </ListSection>
  );
}

/** The "story of us": a memoir in chapters, each sentence footnoted to the messages behind it. */
function StoryCard({ name, first, initial }: { name: string; first: string; initial: Story | null }) {
  const { c } = useDesign();
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
  if (!story)
    return (
      <Callout art={DETECTIVE} title="Story of us" text={`A short memoir of you and ${first}, written from your chats, with every line footnoted.`}>
        {writing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs }}>
            <ActivityIndicator size="small" color={c.accent} />
            <Txt variant="footnote" tone="secondary">
              Writing it. This takes up to half a minute.
            </Txt>
          </View>
        ) : (
          <View style={{ paddingTop: space.sm }}>
            <PillButton title="Write our story" emoji="✍️" onPress={write} small />
          </View>
        )}
        {note ? (
          <Txt variant="footnote" tone="secondary">
            {note}
          </Txt>
        ) : null}
      </Callout>
    );
  return (
    <View style={{ gap: space.lg }}>
      <SectionTitle title="Story of us 📖" />
      <ListSection footer={`Written ${formatAgo(story.writtenAt)} from your chats. Tap a receipt to see the message.`}>
        <View style={{ padding: space.lg, gap: space.xl }}>
          <Txt variant="title3">{story.headline}</Txt>
          {story.chapters.map((chapter) => {
            const notes = chapter.sentences.flatMap((s) => {
              const source = s.refs.map((r) => story.sources[String(r)]).find(Boolean);
              return source ? [{ n: s.n, source }] : [];
            });
            return (
              <View key={chapter.title} style={{ gap: space.sm }}>
                <View style={{ gap: 2 }}>
                  <Txt variant="headline">{chapter.title}</Txt>
                  <Txt variant="footnote" tone="secondary">
                    {chapter.period}
                  </Txt>
                </View>
                <Txt variant="callout" style={{ lineHeight: 24 }}>
                  {chapter.sentences.map((s) => (
                    <Txt key={s.n} variant="callout">
                      {s.text}
                      {notes.some((x) => x.n === s.n) ? (
                        <Txt variant="caption" tone="accent" style={{ fontWeight: '700' }}>
                          {' '}
                          {s.n}
                        </Txt>
                      ) : null}{' '}
                    </Txt>
                  ))}
                </Txt>
                {notes.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 }}>
                    {notes.map((x) => (
                      <Chip key={x.n} label={String(x.n)} emoji="🧾" tint="blue" accessibilityLabel={`Footnote ${x.n}`} onPress={() => open(x.source)} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ListSection>
    </View>
  );
}

/** Recent moments as rows, and a reel of whichever one you pick. */
function Moments({ episodes }: { episodes: FriendProfile['episodes'] }) {
  const shown = episodes.slice(0, SHOWN_EPISODES);
  const [picked, setPicked] = useState(shown[0].id);
  return (
    <View style={{ gap: space.lg }}>
      <ListSection header="Recent moments">
        {shown.map((e) => (
          <ListRow
            key={e.id}
            wrap
            title={e.title}
            subtitle={clip(e.summary, 110) + '\n' + [monthYear(e.start), e.isDm ? 'Your DM' : e.chat, e.messageCount + ' messages'].join(' · ')}
            leading={<EmojiAvatar emoji={emojiFor(e.topics[0] ?? e.title, e.id)} color={fillFor(e.title)} size={36} />}
            onPress={() => open(e.source)}
          />
        ))}
      </ListSection>
      {shown.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.sm }}>
          {shown.map((e) => (
            <Chip key={e.id} label={clip(e.title, 26)} emoji="🎬" selected={e.id === picked} accessibilityLabel={'Reel of ' + e.title} onPress={() => setPicked(e.id)} />
          ))}
        </ScrollView>
      ) : null}
      <ReelButton key={picked} episodeId={picked} />
    </View>
  );
}

/** Opens this friend's Wrapped: the last month of your DM, in highlights. */
export function WrappedButton({ conversationId, first }: { conversationId: string | null | undefined; first: string }) {
  const ready = !!conversationId;
  return (
    <View style={{ gap: space.sm }}>
      <BigButton
        title={`Your Wrapped with ${first}`}
        emoji="🎁"
        kind="pink"
        disabled={!ready}
        onPress={() => router.push({ pathname: '/wrapped/[conversationId]', params: { conversationId: conversationId ?? '' } })}
      />
      <Txt variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
        {conversationId === undefined ? 'Getting it ready…' : ready ? 'The last month of your DM, in highlights.' : 'Wrapped needs a DM with them.'}
      </Txt>
    </View>
  );
}

export function LiveProfile({ name, first, state, retry }: { name: string; first: string; state: State; retry: () => void }) {
  if (state.status === 'loading') return <Callout art={SLEEPY} text={`Reading your chats with ${first}…`} />;
  if (state.status === 'error')
    return (
      <Callout art={GHOST} title={`Couldn’t load what your chats say about ${first}.`} text={state.message}>
        <View style={{ paddingTop: space.sm }}>
          <PillButton title="Try again" onPress={retry} small />
        </View>
      </Callout>
    );
  const p = state.profile;
  const quiet = p.facts.length === 0 && p.plans.length === 0 && p.episodes.length === 0;
  return (
    <>
      {p.stats ? <FriendStats stats={p.stats} first={first} /> : null}
      {p.topics.length > 0 ? (
        <View style={{ gap: space.lg }}>
          <SectionTitle title="You two talk about" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.lg, paddingBottom: space.xs }}>
            {p.topics.slice(0, 8).map((t, i) => (
              <View key={t.topic} style={{ width: 72, alignItems: 'center', gap: space.sm }}>
                <AppIconTile
                  emoji={emojiFor(t.topic, i)}
                  color={fillFor(t.topic)}
                  size={64}
                  accessibilityLabel={`${t.topic}: show it in your topics`}
                  onPress={() => router.push({ pathname: '/portrait', params: { view: 'atlas/t/' + encodeURIComponent(t.topic) } })}
                />
                <Txt variant="caption" numberOfLines={2} style={{ textAlign: 'center', fontWeight: '600' }}>
                  {t.topic[0].toUpperCase() + t.topic.slice(1)}
                </Txt>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {quiet ? <Callout art={WAVE} title={`Still getting to know ${first}`} text={`Your chats haven’t mentioned plans or details about ${first} yet. They’ll show up here as you talk, each with the message it came from.`} /> : null}
      {p.plans.length > 0 ? (
        <ListSection header="Plans from your chats">
          {p.plans.slice(0, 6).map((plan) => (
            <ListRow
              key={plan.episodeId + plan.what}
              wrap
              title={plan.what}
              subtitle={[plan.when, chatLabel(plan.source)].filter(Boolean).join(' · ')}
              leading={<EmojiAvatar emoji="📅" color="mint" size={36} />}
              onPress={() => open(plan.source)}
            />
          ))}
        </ListSection>
      ) : null}
      {p.facts.length > 0 ? <Facts facts={p.facts} /> : null}
      {quiet ? null : <StoryCard name={name} first={first} initial={p.story} />}
      {p.episodes.length > 0 ? <Moments episodes={p.episodes} /> : null}
    </>
  );
}

