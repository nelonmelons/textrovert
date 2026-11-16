import { Text, View } from 'react-native';

import { type, useTheme } from '@/theme';

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('');

/** A friend's initials in a ringed circle, like the Swift Face. */
export function Face({ name, size = 40, ring }: { name: string; size?: number; ring?: string }) {
  const theme = useTheme();
  return (
    <View aria-hidden style={{ padding: 2, borderRadius: size, borderWidth: 2, borderColor: ring ?? theme.tones.accent.fill }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type.subheadline, { fontWeight: '600', color: theme.ink }]}>{initials(name)}</Text>
      </View>
    </View>
  );
}
