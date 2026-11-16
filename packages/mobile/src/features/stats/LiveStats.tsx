import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';

import { Chip, EmojiAvatar, ListRow, ListSection, PillButton, space, StatCard, Txt, useDesign, type FillName } from '@/design';
import { fetchStats, type Stats, type StatsPerson } from '../../api/friend';
import { haptics } from '../../lib/haptics';
import { argmax, BarChart, compact, count, duration, hourLabel, percent, shortHour, WEEKDAYS, WEEKDAYS_LONG } from './parts';

type State = { status: 'loading' } | { status: 'ready'; stats: Stats } | { status: 'error'; message: string };

export function useStats(enabled: boolean) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState({ status: 'loading' });
    fetchStats().then(
      (stats) => live && setState({ status: 'ready', stats }),
      (e: Error) => live && setState({ status: 'error', message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [enabled, attempt]);
  return { state, retry: () => setAttempt((a) => a + 1) };
}

const openPerson = (name: string) => {
  haptics.select();
  router.push({ pathname: '/friend/[id]', params: { id: name } });
};

/** Who starts the conversation with this person, as a short line. */
export function whoFirst(byMe: number, byThem: number, first: string) {
  const total = byMe + byThem;
  if (!total) return null;
  const mine = byMe / total;
  if (mine >= 0.6) return `You text first ${percent(mine)} of the time`;
  if (mine <= 0.4) return `${first} texts first ${percent(1 - mine)} of the time`;
  return 'You take turns starting';
}

/** Month, Year or All time, as the You tab's segmented control indexes them. */
export const RANGES = ['Month', 'Year', 'All time'] as const;

/** Messages in the latest month, the latest twelve, or everything. */
export function rangeTotals(stats: Stats, range: number) {
  const { totals, monthly } = stats.insights;
  if (range === 2 || !monthly.length) return { sent: totals.sent, received: totals.received, since: totals.firstAt ? new Date(totals.firstAt) : null };
  const months = monthly.slice(range === 0 ? -1 : -12);
  return {
    sent: months.reduce((n, m) => n + m.sent, 0),
    received: months.reduce((n, m) => n + m.received, 0),
    since: new Date(months[0].month + '-15'),
  };
}

const hoursOf = (heatmap: number[]) => Array.from({ length: 24 }, (_, h) => WEEKDAYS.reduce((n, _d, d) => n + (heatmap[d * 24 + h] ?? 0), 0));

function Pair({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: space.md }}>{children}</View>;
}

/** The four headline numbers from GET /stats; messages sent follows the range. */
export function HeadlineStats({ stats, range }: { stats: Stats; range: number }) {
  const { insights } = stats;
  const { sent } = rangeTotals(stats, range);
  const top = insights.topEmojis[0]?.text;
  return (
    <View style={{ gap: space.md }}>
      <Pair>
        <StatCard value={compact(sent)} label="Messages sent" emoji="📤" color="mint" />
        <StatCard value={compact(insights.totals.people)} label="People" emoji="👯" color="pink" />
      </Pair>
      <Pair>
        <StatCard value={shortHour(argmax(hoursOf(insights.heatmap)))} label="Peak hour" emoji="🌙" color="lilac" />
        <StatCard value={top ?? '–'} label="Top emoji" emoji="🏆" color="yellow" />
      </Pair>
    </View>
  );
}

/** A plain kit card for charts: the inset-grouped section with one padded child. */
function ChartSection({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <ListSection header={header}>
      <View style={{ padding: space.lg, gap: space.lg }}>{children}</View>
    </ListSection>
  );
}

function PersonRow({ p }: { p: StatsPerson }) {
  const first = p.name.split(/\s+/)[0];
  const starts = whoFirst(p.initiatedByMe, p.initiatedByThem, first);
  const details = [count(p.messages) + ' messages', starts ?? percent(p.fromMe / Math.max(1, p.messages)) + ' from you', p.theirReplyMedianSec != null ? 'replies in ' + duration(p.theirReplyMedianSec) : null];
  return <ListRow title={p.name} subtitle={details.filter(Boolean).join(' · ')} leading={<EmojiAvatar name={p.name} size={40} />} onPress={() => openPerson(p.name)} />;
}

function Habit({ emoji, color, title, value }: { emoji: string; color: FillName; title: string; value: string }) {
  return <ListRow title={title} value={value} leading={<EmojiAvatar emoji={emoji} color={color} size={36} />} />;
}

/** Everything under the headline: when you text, your closest people, your habits and your style. */
export function StatsBreakdown({ stats }: { stats: Stats }) {
  const { insights, people } = stats;
  const hours = hoursOf(insights.heatmap);
  const days = WEEKDAYS.map((_d, d) => insights.heatmap.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0));
  const months = insights.monthly.slice(-12);
  const h = insights.habits;
  return (
    <View style={{ gap: space.xxl }}>
      <ListSection header="Your closest people">
        {people.slice(0, 8).map((p) => (
          <PersonRow key={p.key} p={p} />
        ))}
      </ListSection>

      <ListSection header="Breakdown">
        <Habit emoji="⚡️" color="yellow" title="Your usual reply time" value={duration(insights.reply.myMedianSec)} />
        <Habit emoji="🐢" color="lilac" title="Friends’ usual reply time" value={duration(insights.reply.theirMedianSec)} />
        <Habit emoji="👋" color="mint" title="DMs you start" value={percent(h.initiationRate)} />
        <Habit emoji="🦉" color="blue" title="Texts late at night" value={percent(h.nightOwlRate)} />
        {h.doubleTextRate != null ? <Habit emoji="✌️" color="pink" title="Double texts" value={percent(h.doubleTextRate)} /> : null}
        {h.avgWordsPerMessage != null ? <Habit emoji="📝" color="peach" title="Words per text" value={String(Math.round(h.avgWordsPerMessage * 10) / 10)} /> : null}
      </ListSection>

      <ChartSection header="When you text">
        <Txt variant="callout">
          Most around <Txt variant="callout" style={{ fontWeight: '700' }}>{hourLabel(argmax(hours))}</Txt>, and most on{' '}
          <Txt variant="callout" style={{ fontWeight: '700' }}>{WEEKDAYS_LONG[argmax(days)]}</Txt>.
        </Txt>
        <BarChart values={hours} labels={hours.map((_, i) => (i % 12 || 12) + (i < 12 ? 'a' : 'p'))} labelEvery={6} color="blue" />
        <BarChart values={days} labels={WEEKDAYS} color="lilac" height={56} />
      </ChartSection>

      {months.length > 1 ? (
        <ChartSection header="Month by month">
          <BarChart values={months.map((m) => m.sent + m.received)} labels={months.map((m) => new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'short' }))} color="mint" />
        </ChartSection>
      ) : null}

      {insights.archetypes.length || insights.topEmojis.length ? (
        <ListSection header="Your style">
          {insights.archetypes.map((a, i) => (
            <ListRow key={a.id} title={a.label} subtitle={a.reason} leading={<EmojiAvatar emoji={['✨', '🎭', '🔥', '🌈'][i % 4]} color={(['coral', 'lilac', 'peach', 'lime'] as const)[i % 4]} size={36} />} />
          ))}
          {insights.topEmojis.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.lg }}>
              {insights.topEmojis.slice(0, 6).map((e) => (
                <Chip key={e.text} emoji={e.text} label={count(e.count)} />
              ))}
            </View>
          ) : null}
        </ListSection>
      ) : null}
    </View>
  );
}

export function StatsLoading({ state, retry }: { state: State; retry: () => void }) {
  const { c } = useDesign();
  if (state.status === 'error')
    return (
      <ListSection>
        <View style={{ padding: space.lg, gap: space.md, alignItems: 'flex-start' }}>
          <Txt variant="callout">Couldn’t load your stats. {state.message}</Txt>
          <PillButton title="Try again" onPress={retry} small />
        </View>
      </ListSection>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: 20, borderCurve: 'continuous', backgroundColor: c.grouped }}>
      <ActivityIndicator color={c.accent} />
      <Txt variant="callout" tone="secondary">
        Counting every message…
      </Txt>
    </View>
  );
}
