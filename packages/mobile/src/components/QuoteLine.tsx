import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type, useTheme } from '@/theme';

/** A source message set off by a colored rule, with who said it above, like the Swift quoteLine. */
export function QuoteLine({ who, meta, color, children }: { who: string; meta?: string; color?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.rule, { backgroundColor: color ?? theme.accent }]} />
      <View style={styles.body}>
        <Text style={[type.caption, { color: theme.secondary }]}>
          <Text style={{ color: theme.ink, fontWeight: '600' }}>{who}</Text>
          {meta ? '  ·  ' + meta : ''}
        </Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rule: { width: 3, borderRadius: 2 },
  body: { flex: 1, gap: 4 },
});
