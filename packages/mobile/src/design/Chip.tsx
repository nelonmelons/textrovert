import { View } from 'react-native';

import { PressScale } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { fills, radii, withAlpha, type FillName } from './tokens';

/** A small capsule label: an optional emoji, text and count. Selected chips fill with the accent; tinted ones wash a fill. */
export function Chip({ label, emoji, count, selected, tint, onPress, accessibilityLabel }: { label: string; emoji?: string; count?: number; selected?: boolean; tint?: FillName; onPress?: () => void; accessibilityLabel?: string }) {
  const { c } = useDesign();
  const bg = selected ? c.text : tint ? withAlpha(fills[tint].fill, 0.28) : c.fill;
  const ink = selected ? c.background : c.text;
  return (
    <PressScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: bg, alignSelf: 'flex-start' }}>
      {emoji ? <Txt style={{ fontSize: 14 }}>{emoji}</Txt> : null}
      <Txt variant="subhead" color={ink} style={{ fontWeight: '600', fontSize: 14 }}>
        {label}
      </Txt>
      {count != null ? (
        <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: selected ? withAlpha('#FFFFFF', 0.25) : c.fillStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="caption" color={ink} style={{ fontSize: 11, fontWeight: '700' }}>
            {count}
          </Txt>
        </View>
      ) : null}
    </PressScale>
  );
}
