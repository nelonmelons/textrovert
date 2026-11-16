import { View } from 'react-native';

import { PressScale } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { fills, radii, withAlpha, type FillName } from './tokens';

/** A small pill: optional emoji, text and count. Selected chips are white with pink ink; tinted ones wash a fill over glass. */
export function Chip({ label, emoji, count, selected, tint, onPress, accessibilityLabel }: { label: string; emoji?: string; count?: number; selected?: boolean; tint?: FillName; onPress?: () => void; accessibilityLabel?: string }) {
  const { c } = useDesign();
  const bg = selected ? c.key : tint ? withAlpha(fills[tint].fill, 0.22) : 'rgba(255, 255, 255, 0.12)';
  const ink = selected ? c.keyInk : c.text;
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: bg, borderWidth: selected ? 0 : 0.5, borderColor: 'rgba(255, 255, 255, 0.28)', alignSelf: 'flex-start' }}>
      {emoji ? <Txt style={{ fontSize: 14 }}>{emoji}</Txt> : null}
      <Txt variant="subhead" color={ink} style={{ fontWeight: '700', fontSize: 13 }}>
        {label}
      </Txt>
      {count != null ? (
        <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: selected ? c.accent : 'rgba(255, 255, 255, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="caption" color="#FFFFFF" style={{ fontSize: 10, letterSpacing: 0 }}>
            {count}
          </Txt>
        </View>
      ) : null}
    </PressScale>
  );
}
