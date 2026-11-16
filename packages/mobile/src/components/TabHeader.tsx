import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rounded, Theme, titleShadow, Type } from '../theme';

/** A tab's Spencer title with an optional control under it, floating over the screen's photograph. */
export function TabHeader({ title, children, dark: _dark = false }: { title: string; children?: ReactNode; dark?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" style={[Type.largeTitle, titleShadow, { fontFamily: Rounded.bold, color: Theme.ink, paddingHorizontal: 4 }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 16, paddingHorizontal: 16, paddingBottom: 12 },
});
