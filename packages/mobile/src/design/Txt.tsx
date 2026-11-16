import { StyleSheet, Text, type TextProps } from 'react-native';

import { fonts } from './fonts';
import { useDesign } from './theme';
import { serifVariants, softShadow, titleShadow, type, type TypeName } from './tokens';

export type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'onAccent' | 'onDark' | 'onDarkMuted';

/**
 * Text on Ditto's scale: Spencer for display through title2 and Bitter Sour for script (both with the frontpage's navy
 * title shadow; stat is Spencer too), Arial for the rest. Tone picks a semantic colour; color overrides it. shadow adds a soft lift for body copy sitting directly
 * on the sky.
 */
export function Txt({ variant = 'body', tone = 'primary', color, shadow, style, ...rest }: TextProps & { variant?: TypeName; tone?: Tone; color?: string; shadow?: boolean }) {
  const { c } = useDesign();
  const tones: Record<Tone, string> = {
    primary: c.text,
    secondary: c.textSecondary,
    tertiary: c.textTertiary,
    accent: c.accentText,
    onAccent: c.onAccent,
    onDark: c.onDark,
    onDarkMuted: c.onDarkMuted,
  };
  const serif = serifVariants.includes(variant);
  const script = variant === 'script';
  const family = serif ? fonts.serif : script ? fonts.script : fonts.ui;
  const flat = StyleSheet.flatten([type[variant], serif || script ? titleShadow : shadow ? softShadow : null, { color: color ?? tones[tone] }, style]) ?? {};
  return <Text {...rest} style={{ fontFamily: family, ...flat, ...(serif || script ? { fontWeight: 'normal' } : null) }} />;
}
