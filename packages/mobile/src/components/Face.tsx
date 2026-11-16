import { Text, View } from 'react-native';

import { alpha, useTheme, type Tone } from '@/theme';

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('');

/** A friend's initials in a ringed circle, like the Swift Face. With a tone, the circle takes its fill and ink. */
export function Face({ name, size = 40, ring, tone }: { name: string; size?: number; ring?: string; tone?: Tone }) {
  const theme = useTheme();
  return (
    <View aria-hidden style={{ padding: size >= 32 ? 2 : 1.5, borderRadius: size, borderWidth: size >= 32 ? 2 : 1.5, borderColor: ring ?? (tone ? alpha(tone.ink, 0.35) : theme.tones.accent.fill) }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone?.fill ?? theme.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: Math.round(size * 0.38), fontWeight: '700', color: tone?.ink ?? theme.ink }}>{initials(name)}</Text>
      </View>
    </View>
  );
}

const TONES = ['replies', 'plans', 'activities', 'coral', 'celebrate', 'accent'] as const;

/** A stable section tone for a name, so each friend keeps the same color everywhere. */
export function toneFor(name: string, tones: Record<(typeof TONES)[number], Tone>): Tone {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return tones[TONES[Math.abs(h) % TONES.length]];
}
