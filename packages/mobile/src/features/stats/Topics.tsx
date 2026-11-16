import { useMemo } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { router } from 'expo-router';

import { BigButton, DarkCard, fillFor, PillButton, space, TileGrid, Txt, type TileItem } from '@/design';
import { usePortraitJson } from '../portrait/Portrait';

/** Tags that describe the medium rather than the friendship; the atlas leaves them out too. */
const GENERIC = new Set([
  'media', 'media sharing', 'social media', 'instagram', 'logistics', 'plans', 'planning', 'meetup', 'meetups', 'memes', 'meme', 'reels', 'reel',
  'banter', 'small talk', 'jokes', 'joke', 'humor', 'chat', 'group chat', 'greetings', 'links', 'link sharing', 'photos', 'photo', 'video', 'videos',
  'messages', 'messaging', 'attachments', 'attachment', 'reaction', 'reactions', 'schedule', 'timing', 'texting', 'scheduling', 'coordination', 'hangout', 'hangouts', 'friends', 'friendship', 'conversation', 'inside joke',
]);

const EMOJI: [RegExp, string][] = [
  [/travel|trip|flight|vacation/, '✈️'],
  [/poker|card|casino/, '🃏'],
  [/food|dinner|lunch|breakfast|restaurant|cook|eat/, '🍜'],
  [/coffee|cafe/, '☕️'],
  [/split|money|rent|pay|venmo|budget/, '💸'],
  [/startup|founder|pitch/, '🚀'],
  [/ticket|concert|show/, '🎟️'],
  [/music|song|playlist/, '🎧'],
  [/class|course|lecture|office hours|midterm|exam|school|homework|quercus|attendance|study/, '📚'],
  [/deadline/, '⏰'],
  [/house|housing|apartment|room/, '🏠'],
  [/location|place|map/, '📍'],
  [/poll|vote/, '🗳️'],
  [/teas|roast/, '😜'],
  [/dating|crush|love/, '💘'],
  [/night out|party|club|birthday/, '🪩'],
  [/work|job|intern|career/, '💼'],
  [/meeting|calendar/, '📅'],
  [/hik|outdoor|camp/, '🥾'],
  [/cod|programming|hackathon|tech/, '💻'],
  [/game|gaming/, '🎮'],
  [/movie|film|tv/, '🎬'],
  [/gym|workout|fitness|run/, '🏋️'],
  [/sport|basketball|soccer|football/, '🏀'],
  [/pet|dog|cat/, '🐶'],
];
const MAP = require('../../../assets/art/hedgehog-map.png');
const SLEEPY = require('../../../assets/art/hedgehog-sleepy.png');
const FALLBACK = ['💬', '✨', '🧩', '🌀', '🎈', '🪐'];

export const emojiFor = (topic: string, i: number) => EMOJI.find(([re]) => re.test(topic.toLowerCase()))?.[1] ?? FALLBACK[i % FALLBACK.length];
const openAtlas = (topic?: string) => router.push({ pathname: '/portrait', params: { view: topic ? 'atlas/t/' + encodeURIComponent(topic) : 'atlas' } });

interface PortraitPeople {
  people: { total: number; topics: [string, number][] }[];
}

/** The atlas's territories: topics two or more of your top 60 people share, heaviest first. */
function topicsOf(json: string) {
  const people = (JSON.parse(json) as PortraitPeople).people.filter((p) => p.total > 0).slice(0, 60);
  const byTopic = new Map<string, { people: number; weight: number }>();
  for (const p of people)
    for (const [t, n] of p.topics) {
      if (GENERIC.has(t.toLowerCase())) continue;
      const cur = byTopic.get(t) ?? { people: 0, weight: 0 };
      byTopic.set(t, { people: cur.people + 1, weight: cur.weight + n });
    }
  return [...byTopic]
    .filter(([, v]) => v.people >= 2)
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([topic, v]) => ({ topic, ...v }));
}

/** Your topics as app-icon tiles in the dark card; each opens the atlas on that topic. */
export function TopicTiles({ live }: { live: boolean }) {
  const { json, error, retry } = usePortraitJson(live);
  const topics = useMemo(() => (json ? topicsOf(json) : []), [json]);
  const items: TileItem[] = topics.slice(0, 6).map((t, i) => ({
    emoji: emojiFor(t.topic, i),
    label: t.topic[0].toUpperCase() + t.topic.slice(1),
    color: fillFor(t.topic),
    detail: 'with ' + t.people + ' people',
    onPress: () => openAtlas(t.topic),
  }));
  const row = (art: 'map' | 'sleepy', text: string, busy = false) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, paddingTop: space.xs }}>
      <Image source={art === 'map' ? MAP : SLEEPY} resizeMode="contain" style={{ width: 64, height: 64 }} aria-hidden />
      {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
      <Txt variant="subhead" tone="onDarkMuted" style={{ flex: 1, fontWeight: '500' }}>
        {text}
      </Txt>
    </View>
  );
  if (!live) return <DarkCard>{row('map', 'Your topics are mapped from your own chats. Turn off demo data in Settings to see them.')}</DarkCard>;
  if (error)
    return (
      <DarkCard style={{ paddingBottom: space.lg }}>
        {row('map', 'Couldn’t map your topics. ' + error)}
        <View style={{ alignItems: 'center' }}>
          <PillButton title="Try again" onPress={retry} small />
        </View>
      </DarkCard>
    );
  if (!json) return <DarkCard>{row('sleepy', 'Mapping your topics…', true)}</DarkCard>;
  const rest = topics.length - items.length;
  return (
    <View style={{ gap: space.lg }}>
      <TileGrid items={items} header={row('map', topics.length + ' topics you and your people keep coming back to. Tap one to find it on the map.')} footer={rest > 0 ? 'And ' + rest + ' smaller ' + (rest === 1 ? 'topic.' : 'topics.') : undefined} />
      <BigButton title="Open the atlas" emoji="🗺️" onPress={() => openAtlas()} />
    </View>
  );
}
