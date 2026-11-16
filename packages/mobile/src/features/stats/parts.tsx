import { StyleSheet, Text, View } from 'react-native';
import { fonts, space, Txt, type FillName } from '@/design';
import { radius, Theme, Type } from '../../theme';

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

/** "48K", "9.8K", "865". */
export const compact = (n: number) => (n >= 10000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? Math.round(n / 100) / 10 + 'K' : String(n));

/** "11pm", "9am". */
export const shortHour = (h: number) => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');

export const argmax = (values: number[]) => values.reduce((best, v, i) => (v > values[best] ? i : best), 0);

/** Ditto pink for the one bar that matters; the rest are white at 45%. */
const HOT = '#FF2CAB';
const HOT_TEXT = '#FF7BCB';
const REST = 'rgba(255, 255, 255, 0.45)';

/** A number in Argent Pixel with a short line under it, on a small white-glass tile. */
export function Tile({ value, label, color = '#FFFFFF' }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: fonts.pixel, fontSize: 26, lineHeight: 32, color }}>
        {value}
      </Text>
      <Text style={[Type.footnote, { color: Theme.secondary }]}>{label}</Text>
    </View>
  );
}

export function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** A small bar chart: the tallest bar in Ditto pink, the rest white, labels under every few bars. color is ignored. */
export function Bars({ values, labels, labelEvery = 1, height = 72 }: { values: number[]; labels: string[]; labelEvery?: number; color?: string; height?: number }) {
  const max = Math.max(1, ...values);
  const top = argmax(values);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height }}>
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, height: Math.max(2, (v / max) * height), borderRadius: 3, backgroundColor: i === top ? HOT : REST, boxShadow: i === top ? '0px 0px 10px rgba(255, 44, 171, 0.55)' : undefined }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {labels.map((l, i) => (
          <Text key={i} numberOfLines={1} style={[Type.caption2, { flex: 1, textAlign: 'center', color: i === top ? HOT_TEXT : Theme.secondary, fontWeight: i === top ? '700' : '400' }]}>
            {i % labelEvery === 0 || i === top ? l : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** The kit's bar chart: the tallest bar in Ditto pink with a glow, the rest white at 45%, labels under every few bars. */
export function BarChart({ values, labels, labelEvery = 1, height = 72 }: { values: number[]; labels: string[]; labelEvery?: number; color?: FillName; height?: number }) {
  const max = Math.max(1, ...values);
  const top = argmax(values);
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }}>
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, height: Math.max(3, (v / max) * height), borderRadius: 4, borderCurve: 'continuous', backgroundColor: i === top ? HOT : REST, boxShadow: i === top ? '0px 0px 12px rgba(255, 44, 171, 0.6)' : undefined }} />
        ))}
      </View>
      <View style={{ height: 16 }}>
        {labels.map((l, i) =>
          i % labelEvery === 0 || i === top ? (
            <Txt key={i} variant="caption" color={i === top ? HOT_TEXT : 'rgba(255, 255, 255, 0.55)'} numberOfLines={1} style={{ position: 'absolute', left: `${((i + 0.5) / labels.length) * 100}%`, width: 48, marginLeft: -24, textAlign: 'center', fontSize: 11, letterSpacing: 0, fontWeight: i === top ? '700' : '500' }}>
              {l}
            </Txt>
          ) : null,
        )}
      </View>
    </View>
  );
}

/** Two shares side by side as one bar: you in pink, them in white. */
export function Split({ mine, theirs, mineLabel, theirsLabel }: { mine: number; theirs: number; mineLabel: string; theirsLabel: string }) {
  const total = Math.max(1, mine + theirs);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.12)', gap: 2 }}>
        <View style={{ flex: mine / total, backgroundColor: HOT, borderRadius: 5 }} />
        <View style={{ flex: theirs / total, backgroundColor: 'rgba(255, 255, 255, 0.75)', borderRadius: 5 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[Type.footnote, { color: HOT_TEXT, fontWeight: '700' }]}>{mineLabel}</Text>
        <Text style={[Type.footnote, { color: '#FFFFFF', fontWeight: '700' }]}>{theirsLabel}</Text>
      </View>
    </View>
  );
}

/** Glass pills. tone is ignored; Ditto pills are all the same white glass. */
export function Chips({ items }: { items: string[]; tone?: { ink: string; fill: string } }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((t) => (
        <View key={t} style={styles.chip}>
          <Text style={[Type.subheadline, { color: '#FFFFFF', fontWeight: '700', fontSize: 13 }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** An emoji on a small white-glass circle: the Ditto stand-in for coloured icon tiles in rows. */
export function GlassBadge({ emoji, size = 36 }: { emoji: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.32)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.46, lineHeight: size * 0.6 }}>{emoji}</Text>
    </View>
  );
}

/** White initials on a glass circle with a hairline ring, matching the People list. */
export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('') || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, padding: 2, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)' }}>
      <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: 'rgba(255, 255, 255, 0.16)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[Type.footnote, { color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.34 }]}>{letters}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '47%',
    flexGrow: 1,
    gap: 4,
    padding: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.32)',
    borderLeftColor: 'rgba(255, 255, 255, 0.22)',
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  chip: { paddingHorizontal: 14, height: 32, justifyContent: 'center', borderRadius: radius.capsule, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.28)' },
});
