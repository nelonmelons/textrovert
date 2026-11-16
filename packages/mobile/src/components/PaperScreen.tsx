import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GridPaper } from '@/components/GridPaper';
import { type, useTheme } from '@/theme';

/**
 * A screen on warm paper with the notebook grid, and an inline title bar like the Swift paperNavigationBar. An
 * avatar sits beside the title; with onPressTitle the title becomes a button with a chevron.
 */
export function PaperScreen({
  title,
  subtitle,
  avatar,
  onPressTitle,
  titleLabel,
  left,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  avatar?: ReactNode;
  onPressTitle?: () => void;
  titleLabel?: string;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: theme.paper }]}>
      <GridPaper />
      <View style={[styles.bar, { paddingTop: insets.top || (Platform.OS === 'web' ? 14 : 0), backgroundColor: theme.paper, borderBottomColor: theme.gridMajor }]}>
        <View style={styles.side}>{left}</View>
        <Pressable accessibilityRole={onPressTitle ? 'button' : undefined} aria-label={titleLabel} onPress={onPressTitle} disabled={!onPressTitle} style={styles.center}>
          {({ pressed }) => (
            <View style={[styles.titleRow, { opacity: pressed ? 0.6 : 1 }]}>
              {avatar}
              <View style={avatar ? styles.titlesLeading : styles.titles}>
                <Text accessibilityRole="header" numberOfLines={1} style={[type.headline, { fontFamily: type.title3.fontFamily, color: theme.ink }]}>
                  {title}
                  {onPressTitle ? <Text style={[type.caption, { color: theme.secondary }]}>{'  ▾'}</Text> : null}
                </Text>
                {subtitle ? (
                  <Text numberOfLines={1} style={[type.caption, { color: theme.secondary }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        </Pressable>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { width: 56 },
  right: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 36, maxWidth: '100%' },
  titles: { alignItems: 'center', flexShrink: 1 },
  titlesLeading: { alignItems: 'flex-start', flexShrink: 1 },
});
