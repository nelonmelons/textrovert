import { StyleSheet, Text, View } from 'react-native';

import { HedgehogAvatar } from '@/components/HedgehogAvatar';
import { PaperScreen } from '@/components/PaperScreen';
import { radius, shadow, type, useTheme, type Tone } from '@/theme';

/** Placeholder for a tab whose screen is still being ported. */
export function ComingSoon({ title, blurb, tone }: { title: string; blurb: string; tone?: Tone }) {
  const theme = useTheme();
  return (
    <PaperScreen title={title}>
      <View style={styles.center}>
        <View style={[styles.card, shadow.soft, { backgroundColor: theme.panel }]}>
          <HedgehogAvatar size={56} tone={tone} />
          <Text style={[type.title2, { color: theme.ink }]}>{title}</Text>
          <Text style={[type.subheadline, { color: theme.secondary, textAlign: 'center' }]}>{blurb}</Text>
        </View>
      </View>
    </PaperScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', gap: 10, padding: 24, borderRadius: radius.card },
});
