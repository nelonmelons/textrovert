import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from './Backdrop';
import { PressScale } from './Tactile';
import { Txt } from './Txt';
import { radii, space, type FillName } from './tokens';

/** A house-glass tile: a big Spencer number over a short label. emoji and color are kept for callers and not drawn. */
export function StatCard({ value, label, onPress, style }: { value: string; label: string; emoji?: string; color?: FillName; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={`${value} ${label}`} outerStyle={[{ flex: 1 }, style]}>
      <Glass tone="dark" radius={radii.xl} style={{ padding: space.lg, minHeight: 112, justifyContent: 'flex-end', gap: 6 }}>
        <View>
          <Txt variant="stat" numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Txt>
        </View>
        <Txt variant="footnote" tone="secondary">
          {label}
        </Txt>
      </Glass>
    </PressScale>
  );
}
