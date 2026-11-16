import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { Glass } from './Backdrop';
import { symbolName } from './symbols';
import { PressScale } from './Tactile';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { fills, radii, space, type FillName } from './tokens';

type Kind = 'primary' | 'secondary' | 'pink' | FillName;

/**
 * Ditto's Button: primary is the white/95 pill with bold pink ink, secondary is the white/10 glass pill with white
 * ink, and pink is the solid #FF2CAB pill for the one hot action. Older fill kinds land on glass.
 */
function KeyFace({ kind, height, radius, children, disabled }: { kind: Kind; height: number; radius: number; children: ReactNode; disabled?: boolean }) {
  const { c, shadow } = useDesign();
  const row = { height, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: space.sm };
  if (disabled) return <View style={[row, { borderRadius: radius, backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>{children}</View>;
  if (kind === 'primary') return <View style={[row, { borderRadius: radius, backgroundColor: c.key, boxShadow: shadow.thumb }]}>{children}</View>;
  if (kind === 'pink') return <View style={[row, { borderRadius: radius, backgroundColor: c.accent, boxShadow: shadow.glow }]}>{children}</View>;
  return (
    <Glass tone="light" radius={radius} style={row}>
      {children}
    </Glass>
  );
}

function inkFor(kind: Kind, disabled: boolean | undefined, c: ReturnType<typeof useDesign>['c']) {
  if (disabled) return 'rgba(255, 255, 255, 0.6)';
  if (kind === 'primary') return c.keyInk;
  return '#FFFFFF';
}

/** The full-width call to action. */
export function BigButton({ title, onPress, kind = 'primary', emoji, icon, trailing = null, disabled }: { title: string; onPress?: () => void; kind?: Kind; emoji?: string; icon?: SymbolViewProps['name']; trailing?: string | null; disabled?: boolean }) {
  const { c } = useDesign();
  const ink = inkFor(kind, disabled, c);
  return (
    <PressScale onPress={disabled ? undefined : onPress} scale={0.97} accessibilityLabel={title} style={{ opacity: 1 }}>
      <KeyFace kind={kind} height={52} radius={radii.pill} disabled={disabled}>
        {emoji ? <Txt style={{ fontSize: 18 }}>{emoji}</Txt> : null}
        {icon ? <Icon name={icon} size={18} color={ink} /> : null}
        <Txt variant="headline" color={ink} style={{ fontSize: 16 }}>
          {title}
        </Txt>
        {trailing ? (
          <Txt variant="headline" color={ink} style={{ fontSize: 16, marginLeft: space.xxs }}>
            {trailing}
          </Txt>
        ) : null}
      </KeyFace>
    </PressScale>
  );
}

/** A compact pill for toolbars and inline actions. */
export function PillButton({ title, onPress, kind = 'secondary', emoji, icon, small, disabled, accessibilityLabel }: { title: string; onPress?: () => void; kind?: Kind; emoji?: string; icon?: ReactNode; small?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const { c } = useDesign();
  const ink = inkFor(kind, disabled, c);
  return (
    <PressScale onPress={disabled ? undefined : onPress} accessibilityLabel={accessibilityLabel ?? title} outerStyle={{ alignSelf: 'flex-start' }}>
      <KeyFace kind={kind} height={small ? 32 : 40} radius={radii.pill} disabled={disabled}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: small ? 12 : 16 }}>
          {emoji ? <Txt style={{ fontSize: small ? 13 : 15 }}>{emoji}</Txt> : null}
          {icon}
          <Txt variant="subhead" color={ink} style={{ fontWeight: '700', fontSize: small ? 13 : 14 }}>
            {title}
          </Txt>
        </View>
      </KeyFace>
    </PressScale>
  );
}

/** An SF Symbol with a Material fallback on web and Android. */
export function Icon({ name, size = 20, color = '#FFFFFF', weight = 'semibold' }: { name: SymbolViewProps['name']; size?: number; color?: string; weight?: SymbolViewProps['weight'] }) {
  return <SymbolView name={symbolName(name)} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" style={{ width: size * 1.2, height: size * 1.2 }} />;
}

/** Ditto's icon button: a 44pt glass circle (size="icon" variant="secondary"). */
export function IconButton({ icon, onPress, label, size = 44, kind = 'secondary' }: { icon: SymbolViewProps['name']; onPress?: () => void; label: string; size?: number; kind?: 'primary' | 'secondary' | 'pink' }) {
  const { c } = useDesign();
  return (
    <PressScale onPress={onPress} accessibilityLabel={label} scale={0.92}>
      <KeyFace kind={kind} height={size} radius={size / 2}>
        <View style={{ width: size, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={size * 0.42} color={kind === 'primary' ? c.keyInk : '#FFFFFF'} />
        </View>
      </KeyFace>
    </PressScale>
  );
}

const back: SymbolViewProps['name'] = { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' };

/** Glass back button; goes back if it can, otherwise home. */
export function BackButton({ onPress, icon = back }: { onPress?: () => void; icon?: SymbolViewProps['name'] }) {
  return <IconButton icon={icon} label="Back" onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />;
}

/** Fallback that keeps native platform names out of web bundles' warnings. */
export const sym = (ios: string, material: string): SymbolViewProps['name'] => ({ ios, android: material, web: material }) as SymbolViewProps['name'];
export const isWeb = Platform.OS === 'web';
