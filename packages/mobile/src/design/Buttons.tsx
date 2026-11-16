import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { Glass } from './Backdrop';
import { symbolName } from './symbols';
import { PressScale } from './Tactile';
import { Txt } from './Txt';
import { ditto, radii, space, type FillName } from './tokens';

/** primary is the frontpage's white pill with navy ink; secondary is a form-glass pill with white ink. */
type Kind = 'primary' | 'secondary' | 'pink' | FillName;

function KeyFace({ kind, height, radius, children, disabled }: { kind: Kind; height: number; radius: number; children: ReactNode; disabled?: boolean }) {
  const row = { height, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: space.sm };
  if ((kind === 'primary' || kind === 'pink') && !disabled) return <View style={[row, { borderRadius: radius, backgroundColor: '#FFFFFF' }]}>{children}</View>;
  return (
    <Glass tone="light" radius={radius} style={[row, disabled ? { opacity: 0.6 } : null]}>
      {children}
    </Glass>
  );
}

const inkFor = (kind: Kind, disabled?: boolean) => ((kind === 'primary' || kind === 'pink') && !disabled ? ditto.navy : '#FFFFFF');

/** The full-width call to action: 48pt, 28pt corners, bold 16. */
export function BigButton({ title, onPress, kind = 'primary', emoji, icon, trailing = null, disabled }: { title: string; onPress?: () => void; kind?: Kind; emoji?: string; icon?: SymbolViewProps['name']; trailing?: string | null; disabled?: boolean }) {
  const ink = inkFor(kind, disabled);
  return (
    <PressScale onPress={disabled ? undefined : onPress} scale={0.98} accessibilityLabel={title}>
      <KeyFace kind={kind} height={48} radius={radii.button} disabled={disabled}>
        {emoji ? <Txt style={{ fontSize: 18 }}>{emoji}</Txt> : null}
        {icon ? <Icon name={icon} size={17} color={ink} /> : null}
        <Txt color={ink} style={{ fontSize: 16, lineHeight: 19, fontWeight: '700' }}>
          {title}
        </Txt>
        {trailing ? (
          <Txt color={ink} style={{ fontSize: 16, lineHeight: 19, fontWeight: '700' }}>
            {trailing}
          </Txt>
        ) : null}
      </KeyFace>
    </PressScale>
  );
}

/** A compact pill for toolbars and inline actions (the header's "Log In"). */
export function PillButton({ title, onPress, kind = 'secondary', emoji, icon, small, disabled, accessibilityLabel }: { title: string; onPress?: () => void; kind?: Kind; emoji?: string; icon?: ReactNode; small?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const ink = inkFor(kind, disabled);
  return (
    <PressScale onPress={disabled ? undefined : onPress} accessibilityLabel={accessibilityLabel ?? title} outerStyle={{ alignSelf: 'flex-start' }}>
      <KeyFace kind={kind} height={small ? 32 : 40} radius={radii.pill} disabled={disabled}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: small ? 14 : 18 }}>
          {emoji ? <Txt style={{ fontSize: small ? 13 : 15 }}>{emoji}</Txt> : null}
          {icon}
          <Txt color={ink} style={{ fontWeight: small ? '600' : '400', fontSize: small ? 13 : 16, lineHeight: small ? 16 : 20 }}>
            {title}
          </Txt>
        </View>
      </KeyFace>
    </PressScale>
  );
}

/** An SF Symbol, with its Material counterpart on web and Android. */
export function Icon({ name, size = 20, color = '#FFFFFF', weight = 'semibold' }: { name: SymbolViewProps['name']; size?: number; color?: string; weight?: SymbolViewProps['weight'] }) {
  return <SymbolView name={symbolName(name)} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" style={{ width: size * 1.2, height: size * 1.2 }} />;
}

/** A round form-glass button (or white, for primary). */
export function IconButton({ icon, onPress, label, size = 44, kind = 'secondary', disabled }: { icon: SymbolViewProps['name']; onPress?: () => void; label: string; size?: number; kind?: 'primary' | 'secondary' | 'pink'; disabled?: boolean }) {
  return (
    <PressScale onPress={disabled ? undefined : onPress} accessibilityLabel={label} scale={0.92}>
      <KeyFace kind={kind} height={size} radius={size / 2} disabled={disabled}>
        <View style={{ width: size, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={size * 0.4} color={inkFor(kind, disabled)} />
        </View>
      </KeyFace>
    </PressScale>
  );
}

const back: SymbolViewProps['name'] = { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' };

/** Form-glass back button; goes back if it can, otherwise home. */
export function BackButton({ onPress, icon = back }: { onPress?: () => void; icon?: SymbolViewProps['name'] }) {
  return <IconButton icon={icon} label="Back" onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />;
}

export const sym = (ios: string, material: string): SymbolViewProps['name'] => ({ ios, android: material, web: material }) as SymbolViewProps['name'];
export const isWeb = Platform.OS === 'web';
