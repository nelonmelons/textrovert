import { Text, View } from 'react-native';
import type { FriendStats } from '../../api/friend';
import { SectionCard, ToneTab } from '../../components/Paper';
import { Theme, Type } from '../../theme';
import { argmax, Bars, Chips, count, duration, hourLabel, Split, Tile, Tiles, WEEKDAYS, WEEKDAYS_LONG } from './parts';
import { whoFirst } from './LiveStats';

/** A friend's numbers on their profile: balance, who starts, reply times, streaks and when you two talk. */
export function FriendStatsCard({ stats, first }: { stats: FriendStats; first: string }) {
  const { person: p, dm } = stats;
  if (!p && !dm) return null;
  const mine = dm ? dm.myMessages : (p?.fromMe ?? 0);
  const theirs = dm ? dm.messages - dm.myMessages : (p?.fromThem ?? 0);
  const starts = p ? whoFirst(p.initiatedByMe, p.initiatedByThem, first) : dm ? whoFirst(dm.myInitiations, dm.theirInitiations, first) : null;
  return (
    <SectionCard tone={Theme.plansTone}>
      <View style={{ gap: 14 }}>
        <ToneTab title="You two, by the numbers" symbol="chart.bar.fill" tone={Theme.plansTone} />
        <Text style={[Type.subheadline, { color: Theme.ink }]}>
          <Text style={{ fontWeight: '700' }}>{count(mine + theirs)}</Text> messages{dm ? ' in your DM' : ''}
          {p && dm && p.messages > dm.messages ? `, ${count(p.messages - dm.messages)} more in groups` : ''}.{starts ? ' ' + starts + '.' : ''}
        </Text>
        <Split mine={mine} theirs={theirs} mineLabel={`You ${count(mine)}`} theirsLabel={`${first} ${count(theirs)}`} />
        <Tiles>
          <Tile value={duration(dm?.myReplyMedianSec ?? p?.myReplyMedianSec)} label="your usual reply time" color={Theme.accent} />
          <Tile value={duration(dm?.theirReplyMedianSec ?? p?.theirReplyMedianSec)} label={`${first}’s usual reply time`} color={Theme.plansTone.ink} />
          {dm ? <Tile value={dm.longestStreakDays + (dm.longestStreakDays === 1 ? ' day' : ' days')} label="your longest streak" color={Theme.coralTone.ink} /> : null}
          {dm ? <Tile value={count(dm.activeDays)} label="days you’ve talked" color={Theme.activitiesTone.ink} /> : null}
        </Tiles>
        {dm && dm.messages > 0 ? (
          <>
            <Text style={[Type.subheadline, { color: Theme.ink }]}>
              You two talk most around <Text style={{ fontWeight: '700' }}>{hourLabel(argmax(dm.hourly))}</Text>, and most on <Text style={{ fontWeight: '700' }}>{WEEKDAYS_LONG[argmax(dm.weekday)]}</Text>.
            </Text>
            <Bars values={dm.hourly} labels={dm.hourly.map((_, h) => (h % 12 || 12) + (h < 12 ? 'a' : 'p'))} labelEvery={6} height={56} />
            <Bars values={dm.weekday} labels={WEEKDAYS} color={Theme.repliesTone.ink} height={44} />
          </>
        ) : null}
        {dm?.topEmojis.length ? <Chips items={dm.topEmojis.slice(0, 5).map((e) => `${e.text} ${count(e.count)}`)} tone={Theme.coralTone} /> : null}
      </View>
    </SectionCard>
  );
}
