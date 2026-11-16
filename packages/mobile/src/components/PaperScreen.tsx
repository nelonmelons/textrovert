import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GridPaper } from '@/components/GridPaper';
import { type, useTheme } from '@/theme';

/** A screen on warm paper with the notebook grid, and an inline title bar like the Swift paperNavigationBar. */
export function PaperScreen({ title, subtitle, left, right, children }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: theme.paper }]}>
      <GridPaper />
      <View style={[styles.bar, { paddingTop: insets.top || (Platform.OS === 'web' ? 14 : 0), backgroundColor: theme.paper, borderBottomColor: theme.gridMajor }]}>
        <View style={styles.side}>{left}</View>
        <View style={styles.titles}>
          <Text accessibilityRole="header" numberOfLines={1} style={[type.headline, { fontFamily: type.title3.fontFamily, color: theme.ink }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[type.caption, { color: theme.secondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { width: 72 },
  right: { alignItems: 'flex-end' },
  titles: { flex: 1, alignItems: 'center', minHeight: 36, justifyContent: 'center' },
});
