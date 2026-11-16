import type { ReactNode } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';

import { Tactile } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { fills, lip, radii, space, type FillName } from './tokens';

type Kind = 'primary' | 'secondary' | FillName;

function useKind(kind: Kind) {
  const { c } = useDesign();
  if (kind === 'primary') return { face: c.accent, edge: c.accentEdge, ink: c.onAccent };
  if (kind === 'secondary') return { face: c.surface, edge: c.edge, ink: c.text };
  return { face: fills[kind].fill, edge: fills[kind].edge, ink: fills[kind].ink };
}

/** The full-width call to action: a pressable key on a darker lip, springing down with a firm haptic. */
export function BigButton({ title, onPress, kind = 'primary', emoji, image, trailing = '→', disabled }: { title: string; onPress?: () => void; kind?: Kind; emoji?: string; image?: ImageSourcePropType; trailing?: string | null; disabled?: boolean }) {
  const k = useKind(kind);
  return (
    <Tactile face={k.face} edge={k.edge} radius={radii.md} lip={lip.button} ring={2} haptic="thud" onPress={onPress} disabled={disabled} accessibilityLabel={title} faceStyle={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
      {image ? <Image source={image} resizeMode="contain" style={{ width: 40, height: 40, marginVertical: -4 }} aria-hidden /> : null}
      {emoji ? <Txt style={{ fontSize: 20 }}>{emoji}</Txt> : null}
      <Txt variant="headline" color={k.ink} style={{ fontSize: 18 }}>
        {title}
      </Txt>
      {trailing ? (
        <Txt variant="headline" color={k.ink} style={{ fontSize: 18, marginLeft: space.xs }}>
          {trailing}
        </Txt>
      ) : null}
    </Tactile>
  );
}

/** A compact capsule key for toolbars and inline actions. */
export function PillButton({ title, onPress, kind = 'primary', emoji, icon, small, disabled, accessibilityLabel }: { title: string; onPress?: () => void; kind?: Kind; emoji?: string; icon?: ReactNode; small?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const k = useKind(kind);
  return (
    <View>
      <Tactile face={k.face} edge={k.edge} radius={radii.pill} lip={lip.pill} ring={kind === 'secondary' ? 1.5 : 2} onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? title} faceStyle={{ height: small ? 32 : 38, paddingHorizontal: small ? 12 : 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {emoji ? <Txt style={{ fontSize: small ? 14 : 16 }}>{emoji}</Txt> : null}
        {icon}
        <Txt variant="subhead" color={k.ink} style={{ fontWeight: '600', fontSize: small ? 14 : 15 }}>
          {title}
        </Txt>
      </Tactile>
    </View>
  );
}
