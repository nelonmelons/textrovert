import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, type, useTheme, type Tone } from '@/theme';

/** A capsule label: a source chip, a scope chip, or a filter. Selected chips take their tone's fill and ink. */
export function Chip({
  label,
  tone,
  selected = true,
  leading,
  onPress,
  onRemove,
  accessibilityLabel,
}: {
  label: string;
  tone?: Tone;
  selected?: boolean;
  leading?: string;
  onPress?: () => void;
  onRemove?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const t = tone ?? theme.tones.accent;
  const ink = selected ? t.ink : theme.secondary;
  return (
    <View style={[styles.chip, { backgroundColor: selected ? t.fill : theme.fillTertiary }]}>
      <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={!onPress} style={styles.main}>
        {leading ? <Text style={[type.caption, styles.leading, { color: ink }]}>{leading}</Text> : null}
        <Text numberOfLines={1} style={[type.caption, { color: ink, fontWeight: '600', flexShrink: 1 }]}>
          {label}
        </Text>
      </Pressable>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={'Remove ' + label} onPress={onRemove} hitSlop={8} style={styles.remove}>
          <Text style={[type.caption, { color: ink, fontWeight: '700' }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.capsule, maxWidth: '100%' },
  main: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 1 },
  leading: { fontWeight: '800' },
  remove: { paddingRight: 10, paddingLeft: 2, paddingVertical: 6 },
});
