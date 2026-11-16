import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rounded, Theme, Type } from '../theme';

/** A tab's large title with an optional control under it, on paper or on the portrait's night sky. */
export function TabHeader({ title, children, dark = false }: { title: string; children?: ReactNode; dark?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 12, backgroundColor: dark ? '#0b0810' : Theme.paper, borderBottomColor: dark ? 'transparent' : Theme.gridMajor }]}>
      <Text accessibilityRole="header" style={[Type.largeTitle, { fontFamily: Rounded.bold, color: dark ? '#FFFFFF' : Theme.ink }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 12, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
