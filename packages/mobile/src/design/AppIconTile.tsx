import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { PressScale, Tactile } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { fills, iconRadius, space, tileGradient, type FillName } from './tokens';

/** An iOS app-icon square: a gradient cut from a fill, one big emoji, and a darker lip underneath. */
export function AppIconTile({ emoji, color = 'blue', size = 64, onPress, accessibilityLabel }: { emoji: string; color?: FillName; size?: number; onPress?: () => void; accessibilityLabel?: string }) {
  return (
    <Tactile
      face={tileGradient(color)}
      edge={fills[color].edge}
      radius={iconRadius(size)}
      lip={Math.max(3, Math.round(size * 0.06))}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={{ width: size }}
      faceStyle={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Txt style={{ fontSize: size * 0.5, lineHeight: size * 0.62, textAlign: 'center' }}>{emoji}</Txt>
    </Tactile>
  );
}

/** The dark rounded card that holds tile grids and feature callouts. */
export function DarkCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, shadow } = useDesign();
  return <View style={[{ backgroundColor: c.darkCard, borderRadius: 32, borderCurve: 'continuous', padding: 10, gap: 10, boxShadow: shadow.float }, style]}>{children}</View>;
}

export interface TileItem {
  emoji: string;
  label: string;
  color?: FillName;
  /** A small line under the label, e.g. a count. */
  detail?: string;
  onPress?: () => void;
}

/** App-icon tiles with labels in a two-column dark card, with an optional header row above them. */
export function TileGrid({ items, columns = 2, header, footer, style }: { items: TileItem[]; columns?: number; header?: ReactNode; footer?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useDesign();
  const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, r) => items.slice(r * columns, r * columns + columns));
  return (
    <DarkCard style={style}>
      {header}
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((item) => (
            <PressScale
              key={item.label}
              onPress={item.onPress}
              accessibilityLabel={item.label}
              outerStyle={{ flex: 1 }}
              style={{ backgroundColor: c.darkCell, borderColor: c.darkCellEdge, borderWidth: 1, borderRadius: 22, borderCurve: 'continuous', alignItems: 'center', paddingTop: space.xl, paddingBottom: space.lg, gap: space.md }}>
              <AppIconTile emoji={item.emoji} color={item.color} size={56} />
              <View style={{ alignItems: 'center', gap: 1 }}>
                <Txt variant="headline" tone="onDark" style={{ fontSize: 15 }}>
                  {item.label}
                </Txt>
                {item.detail ? (
                  <Txt variant="footnote" tone="onDarkMuted">
                    {item.detail}
                  </Txt>
                ) : null}
              </View>
            </PressScale>
          ))}
          {row.length < columns ? Array.from({ length: columns - row.length }, (_, i) => <View key={i} style={{ flex: 1 }} />) : null}
        </View>
      ))}
      {footer ? (
        <Txt variant="subhead" tone="onDarkMuted" style={{ textAlign: 'center', paddingTop: space.sm, paddingBottom: space.md, fontWeight: '500' }}>
          {footer}
        </Txt>
      ) : null}
    </DarkCard>
  );
}
