import { ReactNode } from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Rounded, Theme, Tone, Type, withAlpha } from '../theme';
import { deadlineText } from '../fixtures';

const CELL = 22;

export function GridPaper({ width, height }: { width: number; height: number }) {
  const columns = Math.ceil(width / CELL) + 1;
  const rows = Math.ceil(height / CELL) + 1;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: columns }, (_, i) => (
        <View
          key={`c${i}`}
          style={{ position: 'absolute', top: 0, bottom: 0, left: i * CELL, width: i % 4 === 0 ? 0.75 : 0.5, backgroundColor: i % 4 === 0 ? Theme.gridMajor : Theme.gridLine }}
        />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={`r${i}`}
          style={{ position: 'absolute', left: 0, right: 0, top: i * CELL, height: i % 4 === 0 ? 0.75 : 0.5, backgroundColor: i % 4 === 0 ? Theme.gridMajor : Theme.gridLine }}
        />
      ))}
    </View>
  );
}

export function Symbol({ name, size, color, weight }: { name: SymbolViewProps['name']; size: number; color: string; weight?: SymbolViewProps['weight'] }) {
  return <SymbolView name={name} size={size} tintColor={color} weight={weight ?? 'regular'} resizeMode="scaleAspectFit" style={{ width: size * 1.25, height: size * 1.1 }} />;
}

export function Face({ initials }: { initials: string }) {
  return (
    <View style={styles.faceRing}>
      <View style={styles.face}>
        <Text style={[Type.headline, { color: Theme.ink }]}>{initials}</Text>
      </View>
    </View>
  );
}

export function ToneTab({ title, symbol, tone }: { title: string; symbol: SymbolViewProps['name']; tone: Tone }) {
  return (
    <View style={[styles.tab, { backgroundColor: tone.fill }]}>
      <Symbol name={symbol} size={14} color={tone.ink} weight="semibold" />
      <Text style={[styles.tabText, { color: tone.ink }]}>{title}</Text>
    </View>
  );
}

export function SectionCard({ tone, fillOpacity = 0.5, children, style }: { tone: Tone; fillOpacity?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.cardShadow, style]}>
      <View style={[styles.card, { borderColor: tone.fill }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(tone.fill, fillOpacity) }]} />
        {children}
      </View>
    </View>
  );
}

export function RowChevron() {
  return <Symbol name="chevron.right" size={12} color={Theme.secondary} weight="bold" />;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: Theme.separator }} />;
}

export function DeadlineBadge({ deadline }: { deadline: Date }) {
  const { text, urgent } = deadlineText(deadline);
  return (
    <View style={[styles.badge, { backgroundColor: urgent ? Theme.deadline : Theme.tertiaryFill }]}>
      <Symbol name={urgent ? 'clock.badge.exclamationmark.fill' : 'clock'} size={13} color={urgent ? '#FFFFFF' : Theme.ink} weight={urgent ? 'semibold' : 'medium'} />
      <Text style={[Type.subheadline, { color: urgent ? '#FFFFFF' : Theme.ink, fontWeight: urgent ? '600' : '500' }]}>{text}</Text>
    </View>
  );
}

export const art = {
  mark: require('../../assets/art/hedgehog-mark.png'),
  toast: require('../../assets/art/hedgehog-toast.png'),
  bird: require('../../assets/art/hedgehog-bird.png'),
};

export function HedgehogMark({ height, color = Theme.accent }: { height: number; color?: string }) {
  return <Image source={art.mark} style={{ height, width: height * 1.3, tintColor: color }} resizeMode="contain" />;
}

export const roundedText = (weight: 'bold' | 'heavy') => ({ fontFamily: Rounded[weight] });

const styles = StyleSheet.create({
  faceRing: {
    padding: 3,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: withAlpha(Theme.accent, 0.45),
  },
  face: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 10,
    borderTopRightRadius: 4,
  },
  tabText: { ...Type.subheadline, fontFamily: Rounded.bold },
  cardShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: Theme.background,
    padding: 16,
    overflow: 'hidden',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
