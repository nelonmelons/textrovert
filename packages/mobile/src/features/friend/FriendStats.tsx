import { View } from 'react-native';

import { fills, ListSection, SectionTitle, space, StatCard, Txt, useDesign } from '@/design';
import type { FriendStats as Stats } from '../../api/friend';
import { argmax, BarChart, compact, count, duration, hourLabel, WEEKDAYS, WEEKDAYS_LONG } from '../stats/parts';
import { whoFirst } from '../stats/LiveStats';

/** A friend's numbers on their profile: how much you text, streaks, reply times, who starts, and when you two talk. */
export function FriendStats({ stats, first }: { stats: Stats; first: string }) {
  const { c } = useDesign();
  const { person: p, dm } = stats;
  if (!p && !dm) return null;
  const mine = dm ? dm.myMessages : (p?.fromMe ?? 0);
  const theirs = dm ? dm.messages - dm.myMessages : (p?.fromThem ?? 0);
  const total = Math.max(1, mine + theirs);
  const starts = p ? whoFirst(p.initiatedByMe, p.initiatedByThem, first) : dm ? whoFirst(dm.myInitiations, dm.theirInitiations, first) : null;
  const emoji = dm?.topEmojis[0]?.text;
  return (
    <View style={{ gap: space.lg }}>
      <SectionTitle title="You two, by the numbers" />
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatCard value={compact(mine + theirs)} label={dm ? 'DM messages' : 'Messages'} emoji="💬" color="mint" />
          {dm ? <StatCard value={String(dm.longestStreakDays)} label="Day streak" emoji="🔥" color="peach" /> : <StatCard value={compact(p?.dmMessages ?? 0)} label="In your DM" emoji="📨" color="peach" />}
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatCard value={duration(dm?.theirReplyMedianSec ?? p?.theirReplyMedianSec)} label={first + '’s replies'} emoji="⏱️" color="lilac" />
          {emoji ? <StatCard value={emoji} label="Top emoji" emoji="🏆" color="yellow" /> : <StatCard value={duration(dm?.myReplyMedianSec ?? p?.myReplyMedianSec)} label="Your replies" emoji="⚡️" color="yellow" />}
        </View>
      </View>
      <ListSection header="Who texts more" footer={p && dm && p.messages > dm.messages ? count(p.messages - dm.messages) + ' more messages in group chats.' : undefined}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: c.fill }}>
            <View style={{ flex: mine / total, backgroundColor: c.accent }} />
            <View style={{ flex: theirs / total, backgroundColor: fills.pink.fill }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="subhead" tone="accent" style={{ fontWeight: '600' }}>
              You {count(mine)}
            </Txt>
            <Txt variant="subhead" color={fills.pink.edge} style={{ fontWeight: '600' }}>
              {first} {count(theirs)}
            </Txt>
          </View>
          {starts ? (
            <Txt variant="callout" tone="secondary">
              {starts}.
            </Txt>
          ) : null}
        </View>
      </ListSection>
      {dm && dm.messages > 0 ? (
        <ListSection header="When you talk">
          <View style={{ padding: space.lg, gap: space.lg }}>
            <Txt variant="callout">
              Most around <Txt variant="callout" style={{ fontWeight: '700' }}>{hourLabel(argmax(dm.hourly))}</Txt>, and most on <Txt variant="callout" style={{ fontWeight: '700' }}>{WEEKDAYS_LONG[argmax(dm.weekday)]}</Txt>.
            </Txt>
            <BarChart values={dm.hourly} labels={dm.hourly.map((_, h) => (h % 12 || 12) + (h < 12 ? 'a' : 'p'))} labelEvery={6} height={56} color="blue" />
            <BarChart values={dm.weekday} labels={WEEKDAYS} height={44} color="pink" />
          </View>
        </ListSection>
      ) : null}
    </View>
  );
}
