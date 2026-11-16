import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from './Backdrop';
import { EmojiAvatar } from './EmojiAvatar';
import { Chevron } from './Kit';
import { PressScale } from './Tactile';
import { Txt } from './Txt';
import { radii, space, type FillName } from './tokens';

/** No app-icon tiles on the frontpage: an emoji on Messages' grey contact circle instead. */
export function AppIconTile({ emoji, size = 56, onPress, accessibilityLabel }: { emoji: string; color?: FillName; size?: number; onPress?: () => void; accessibilityLabel?: string }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <EmojiAvatar emoji={emoji} size={size} />
    </PressScale>
  );
}

/** The house-glass card that holds grids and callouts. */
export function DarkCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass tone="dark" radius={radii.xl} style={[{ padding: space.md, gap: space.md }, style]}>
      {children}
    </Glass>
  );
}

export interface TileItem {
  emoji?: string;
  label: string;
  color?: FillName;
  detail?: string;
  onPress?: () => void;
}

/**
 * Items in house-glass cells, two to a row: a Spencer label, a small detail line and a pink chevron, under an optional
 * header row. No icons: the frontpage labels things with type, not tiles.
 */
export function TileGrid({ items, columns = 2, header, footer, style }: { items: TileItem[]; columns?: number; header?: ReactNode; footer?: string; style?: StyleProp<ViewStyle> }) {
  const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, r) => items.slice(r * columns, r * columns + columns));
  return (
    <View style={[{ gap: 10 }, style]}>
      {header}
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((item) => (
            <PressScale key={item.label} onPress={item.onPress} accessibilityLabel={item.label} outerStyle={{ flex: 1 }}>
              <Glass tone="dark" radius={radii.xl} style={{ padding: space.lg, minHeight: 96, justifyContent: 'space-between', gap: space.sm }}>
                <Txt variant="title2" numberOfLines={2}>
                  {item.label}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  {item.detail ? (
                    <Txt variant="footnote" tone="secondary" style={{ flex: 1 }}>
                      {item.detail}
                    </Txt>
                  ) : (
                    <View />
                  )}
                  {item.onPress ? <Chevron size={14} /> : null}
                </View>
              </Glass>
            </PressScale>
          ))}
          {row.length < columns ? Array.from({ length: columns - row.length }, (_, i) => <View key={i} style={{ flex: 1 }} />) : null}
        </View>
      ))}
      {footer ? (
        <Txt variant="footnote" tone="secondary" shadow style={{ textAlign: 'center', paddingTop: space.xs }}>
          {footer}
        </Txt>
      ) : null}
    </View>
  );
}
