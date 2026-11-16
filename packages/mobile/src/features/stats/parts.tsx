import { StyleSheet, Text, View } from 'react-native';
import { radius, Rounded, Theme, Type, withAlpha } from '../../theme';

export const count = (n: number) => n.toLocaleString('en-US');
export const percent = (share: number | null | undefined) => (share == null ? '–' : Math.round(share * 100) + '%');
export const hourLabel = (h: number) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** "45s", "3 min", "2 hr" for a reply time in seconds. */
export function duration(sec: number | null | undefined) {
  if (sec == null) return '–';
  if (sec < 60) return Math.round(sec) + 's';
  if (sec < 3600) return Math.round(sec / 60) + ' min';
  return Math.round((sec / 3600) * 10) / 10 + ' hr';
}

export const argmax = (values: number[]) => values.reduce((best, v, i) => (v > values[best] ? i : best), 0);

/** A number with a short line under it, on a white tile. */
export function Tile({ value, label, color = Theme.celebrateTone.ink }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[Type.title2, { color, fontFamily: Rounded.bold }]}>
        {value}
      </Text>
      <Text style={[Type.footnote, { color: Theme.secondary }]}>{label}</Text>
    </View>
  );
}

export function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** A small bar chart; the tallest bar is highlighted and labels show under every few bars. */
export function Bars({ values, labels, labelEvery = 1, color = Theme.plansTone.ink, height = 72 }: { values: number[]; labels: string[]; labelEvery?: number; color?: string; height?: number }) {
  const max = Math.max(1, ...values);
  const top = argmax(values);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height }}>
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, height: Math.max(2, (v / max) * height), borderRadius: 3, backgroundColor: i === top ? color : withAlpha(color, 0.35) }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {labels.map((l, i) => (
          <Text key={i} numberOfLines={1} style={[Type.caption2, { flex: 1, textAlign: 'center', color: i === top ? color : Theme.secondary, fontWeight: i === top ? '700' : '400' }]}>
            {i % labelEvery === 0 || i === top ? l : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Two shares side by side as one bar: you and them. */
export function Split({ mine, theirs, mineLabel, theirsLabel }: { mine: number; theirs: number; mineLabel: string; theirsLabel: string }) {
  const total = Math.max(1, mine + theirs);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: Theme.tertiaryFill }}>
        <View style={{ flex: mine / total, backgroundColor: Theme.accent }} />
        <View style={{ flex: theirs / total, backgroundColor: Theme.plansTone.ink }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[Type.footnote, { color: Theme.accent, fontWeight: '600' }]}>{mineLabel}</Text>
        <Text style={[Type.footnote, { color: Theme.plansTone.ink, fontWeight: '600' }]}>{theirsLabel}</Text>
      </View>
    </View>
  );
}

export function Chips({ items, tone = Theme.accentTone }: { items: string[]; tone?: { ink: string; fill: string } }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((t) => (
        <View key={t} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.capsule, backgroundColor: tone.fill }}>
          <Text style={[Type.subheadline, { color: tone.ink, fontWeight: '500' }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%', flexGrow: 1, gap: 4, padding: 14, borderRadius: radius.tile, backgroundColor: withAlpha(Theme.panel, 0.92), borderWidth: StyleSheet.hairlineWidth, borderColor: Theme.gridMajor },
});
