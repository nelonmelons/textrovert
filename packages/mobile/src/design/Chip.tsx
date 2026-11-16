import { View } from 'react-native';

import { PressScale } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { fills, radii, withAlpha, type FillName } from './tokens';

/** A small form-glass pill with a white rim: optional emoji, text and a pink count. Selected chips are the white pill with navy ink. */
export function Chip({ label, emoji, count, selected, tint, onPress, accessibilityLabel }: { label: string; emoji?: string; count?: number; selected?: boolean; tint?: FillName; onPress?: () => void; accessibilityLabel?: string }) {
  const { c } = useDesign();
  const bg = selected ? c.key : 'rgba(255, 255, 255, 0.1)';
  const ink = selected ? c.keyInk : c.text;
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: bg, borderWidth: selected ? 0 : 1, borderColor: 'rgba(255, 255, 255, 0.45)', alignSelf: 'flex-start' }}>
      {emoji ? <Txt style={{ fontSize: 14 }}>{emoji}</Txt> : null}
      <Txt variant="subhead" color={ink} style={{ fontWeight: '600', fontSize: 13 }}>
        {label}
      </Txt>
      {count != null ? (
        <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: '#F748B1', alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="caption" color="#FFFFFF" style={{ fontSize: 10, letterSpacing: 0 }}>
            {count}
          </Txt>
        </View>
      ) : null}
    </PressScale>
  );
}
