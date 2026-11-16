import { StyleSheet, Text, type TextProps } from 'react-native';

import { geistFor } from './fonts';
import { useDesign } from './theme';
import { type, type TypeName } from './tokens';

export type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'onAccent' | 'onDark' | 'onDarkMuted';

/** Text in Geist on the type scale. Tone picks a semantic colour; color overrides it. */
export function Txt({ variant = 'body', tone = 'primary', color, style, ...rest }: TextProps & { variant?: TypeName; tone?: Tone; color?: string }) {
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
  const flat = StyleSheet.flatten([type[variant], { color: color ?? tones[tone] }, style]) ?? {};
  return <Text {...rest} style={{ ...flat, fontFamily: geistFor(flat.fontWeight), fontWeight: 'normal' }} />;
}
