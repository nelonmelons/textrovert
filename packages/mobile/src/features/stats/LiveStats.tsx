import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchStats, type Stats, type StatsPerson } from '../../api/friend';
import { initials } from '../../api/people';
import { Divider, Face, RowChevron, SectionCard, ToneTab } from '../../components/Paper';
import { FadeIn } from '../../components/FadeIn';
import { haptics } from '../../lib/haptics';
import { Rounded, Theme, Type, withAlpha } from '../../theme';
import { argmax, Bars, Chips, count, duration, hourLabel, percent, Split, Tile, Tiles, WEEKDAYS, WEEKDAYS_LONG } from './parts';

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

function PersonRow({ p }: { p: StatsPerson }) {
  const first = p.name.split(/\s+/)[0];
  const starts = whoFirst(p.initiatedByMe, p.initiatedByThem, first);
  return (
    <Pressable onPress={() => openPerson(p.name)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 2 }, pressed && { opacity: 0.6 }]}>
      <Face initials={initials(p.name)} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[Type.headline, { color: Theme.ink }]}>
          {p.name}
        </Text>
        <Text numberOfLines={1} style={[Type.footnote, { color: Theme.secondary }]}>
          {count(p.messages)} messages · {percent(p.fromMe / Math.max(1, p.messages))} from you
        </Text>
        {starts || p.theirReplyMedianSec != null ? (
          <Text numberOfLines={1} style={[Type.footnote, { color: Theme.secondary }]}>
            {[starts, p.theirReplyMedianSec != null ? `replies in ${duration(p.theirReplyMedianSec)}` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <RowChevron />
    </Pressable>
  );
}

/** The You tab's stats: the analyzer's numbers over every chat (GET /stats). */
export function LiveStats({ stats }: { stats: Stats }) {
  const { insights, people } = stats;
  const t = insights.totals;
  const hours = Array.from({ length: 24 }, (_, h) => WEEKDAYS.reduce((n, _d, d) => n + (insights.heatmap[d * 24 + h] ?? 0), 0));
  const days = WEEKDAYS.map((_d, d) => insights.heatmap.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0));
  const months = insights.monthly.slice(-12);
  const since = t.firstAt ? new Date(t.firstAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
  return (
    <View style={{ gap: 18 }}>
      <FadeIn>
        <SectionCard tone={Theme.celebrateTone} fillOpacity={0.55}>
          <View style={{ gap: 4 }}>
            <ToneTab title="Your texting" symbol="chart.bar.fill" tone={Theme.celebrateTone} style={{ marginBottom: 8 }} />
            <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 52, lineHeight: 60, color: Theme.accent, fontFamily: Rounded.heavy }}>
              {count(t.messages)}
            </Text>
            <Text style={[Type.subheadline, { color: Theme.secondary }]}>
              messages with {count(t.people)} people across {t.dms} DMs and {t.groups} groups{since ? ' since ' + since : ''}
            </Text>
            <View style={{ marginTop: 12 }}>
              <Split mine={t.sent} theirs={t.received} mineLabel={`You sent ${count(t.sent)}`} theirsLabel={`You got ${count(t.received)}`} />
            </View>
          </View>
        </SectionCard>
      </FadeIn>

      <Tiles>
        <Tile value={duration(insights.reply.myMedianSec)} label="is how fast you usually reply" color={Theme.accent} />
        <Tile value={duration(insights.reply.theirMedianSec)} label="is how fast your friends reply" color={Theme.plansTone.ink} />
        <Tile value={percent(insights.habits.initiationRate)} label="of your DMs start with you" color={Theme.repliesTone.ink} />
        <Tile value={percent(insights.habits.nightOwlRate)} label="of your texts are late at night" color={Theme.coralTone.ink} />
        {insights.habits.doubleTextRate != null ? <Tile value={percent(insights.habits.doubleTextRate)} label="are double texts" color={Theme.activitiesTone.ink} /> : null}
        {insights.habits.avgWordsPerMessage != null ? <Tile value={String(Math.round(insights.habits.avgWordsPerMessage * 10) / 10)} label="words in your average text" /> : null}
      </Tiles>

      <SectionCard tone={Theme.plansTone}>
        <View style={{ gap: 14 }}>
          <ToneTab title="When you text" symbol="clock.fill" tone={Theme.plansTone} />
          <Text style={[Type.subheadline, { color: Theme.ink }]}>
            Most around <Text style={{ fontWeight: '700' }}>{hourLabel(argmax(hours))}</Text>, and most on <Text style={{ fontWeight: '700' }}>{WEEKDAYS_LONG[argmax(days)]}</Text>.
          </Text>
          <Bars values={hours} labels={hours.map((_, h) => (h % 12 || 12) + (h < 12 ? 'a' : 'p'))} labelEvery={6} />
          <Bars values={days} labels={WEEKDAYS} color={Theme.repliesTone.ink} height={56} />
        </View>
      </SectionCard>

      {months.length > 1 ? (
        <SectionCard tone={Theme.activitiesTone}>
          <View style={{ gap: 14 }}>
            <ToneTab title="Month by month" symbol="calendar" tone={Theme.activitiesTone} />
            <Bars values={months.map((m) => m.sent + m.received)} labels={months.map((m) => new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'narrow' }))} color={Theme.activitiesTone.ink} />
          </View>
        </SectionCard>
      ) : null}

      <SectionCard tone={Theme.accentTone}>
        <View style={{ gap: 12 }}>
          <ToneTab title="Your closest people" symbol="person.2.fill" tone={Theme.accentTone} />
          {people.slice(0, 8).map((p, i) => (
            <View key={p.key} style={{ gap: 12 }}>
              {i > 0 ? <Divider /> : null}
              <PersonRow p={p} />
            </View>
          ))}
        </View>
      </SectionCard>

      {insights.topEmojis.length || insights.archetypes.length ? (
        <SectionCard tone={Theme.coralTone}>
          <View style={{ gap: 12 }}>
            <ToneTab title="Your style" symbol="sparkles" tone={Theme.coralTone} />
            {insights.archetypes.map((a) => (
              <View key={a.id} style={{ gap: 2 }}>
                <Text style={[Type.headline, { color: Theme.ink }]}>{a.label}</Text>
                <Text style={[Type.footnote, { color: Theme.secondary }]}>{a.reason}</Text>
              </View>
            ))}
            {insights.topEmojis.length ? <Chips items={insights.topEmojis.slice(0, 6).map((e) => `${e.text} ${count(e.count)}`)} tone={Theme.coralTone} /> : null}
          </View>
        </SectionCard>
      ) : null}
    </View>
  );
}

export function StatsLoading({ state, retry }: { state: State; retry: () => void }) {
  if (state.status === 'error')
    return (
      <SectionCard tone={Theme.coralTone}>
        <View style={{ gap: 8 }}>
          <Text style={[Type.subheadline, { color: Theme.ink }]}>Couldn’t load your stats. {state.message}</Text>
          <Pressable onPress={retry} hitSlop={8}>
            <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Try again</Text>
          </Pressable>
        </View>
      </SectionCard>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 18, backgroundColor: withAlpha(Theme.panel, 0.9) }}>
      <ActivityIndicator color={Theme.accent} />
      <Text style={[Type.subheadline, { color: Theme.secondary }]}>Counting every message…</Text>
    </View>
  );
}
