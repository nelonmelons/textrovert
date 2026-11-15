import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';

export const PHONE = { width: 390, height: 844 };

/** On wide web windows, shows the app inside a centered phone-sized frame; everywhere else it fills the screen. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < 600) return <View style={styles.fill}>{children}</View>;
  return (
    <View style={[styles.desk, { backgroundColor: theme.scheme === 'dark' ? '#141114' : '#E7E0D3' }]}>
      <View style={[styles.phone, { height: Math.min(PHONE.height, height - 48) }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  desk: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phone: {
    width: PHONE.width,
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 8,
    borderColor: '#1E1A1C',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
});
