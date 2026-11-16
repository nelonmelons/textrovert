import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Tactile } from './Tactile';
import { Txt } from './Txt';
import { fills, lip, radii, space, type FillName } from './tokens';

/** A saturated tile with a big number, an emoji and a label, sitting on a lip of its edge colour. */
export function StatCard({ value, label, emoji, color = 'mint', onPress, style }: { value: string; label: string; emoji?: string; color?: FillName; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const f = fills[color];
  return (
    <View style={[{ flex: 1 }, style]}>
      <Tactile face={f.fill} edge={f.edge} radius={radii.xl} lip={lip.card} ring={2} onPress={onPress} accessibilityLabel={`${value} ${label}`} faceStyle={{ padding: space.lg, paddingTop: space.md, minHeight: 132, justifyContent: 'space-between' }}>
        <Txt style={{ fontSize: 28, lineHeight: 36 }}>{emoji ?? ' '}</Txt>
        <View>
          <Txt variant="stat" color={f.ink} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Txt>
          <Txt variant="subhead" color={f.ink} style={{ fontWeight: '600', opacity: 0.72 }}>
            {label}
          </Txt>
        </View>
      </Tactile>
    </View>
  );
}
