import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from './Backdrop';
import { PressScale } from './Tactile';
import { Txt } from './Txt';
import { fills, radii, space, type FillName } from './tokens';

/** A glass tile with a big Argent Pixel number, an emoji and a label; the fill tints the number. */
export function StatCard({ value, label, emoji, color = 'mint', onPress, style }: { value: string; label: string; emoji?: string; color?: FillName; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const f = fills[color];
  return (
    <PressScale onPress={onPress} accessibilityLabel={`${value} ${label}`} outerStyle={[{ flex: 1 }, style]}>
      <Glass tone="dark" radius={radii.xl} style={{ padding: space.lg, paddingTop: space.md, minHeight: 132, justifyContent: 'space-between' }}>
        <Txt style={{ fontSize: 26, lineHeight: 34 }}>{emoji ?? ' '}</Txt>
        <View>
          <Txt variant="stat" color={f.fill} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Txt>
          <Txt variant="subhead" tone="secondary" style={{ fontWeight: '700' }}>
            {label}
          </Txt>
        </View>
      </Glass>
    </PressScale>
  );
}
