import type { ReactNode } from 'react';
import { Image, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { fill, scenes } from '../design/Backdrop';

export const PHONE = { width: 390, height: 844 };

/**
 * On wide web windows, the frontpage hero's look: the painted sky behind a liquid-glass phone (clear, a white rim, a lit
 * top edge, a soft navy shadow), with the screen clipped to 32px inside it.
 * Everywhere else the app fills the screen.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < 600) return <View style={styles.fill}>{children}</View>;
  return (
    <View style={styles.desk}>
      <Image source={scenes.desk} resizeMode="cover" style={fill} />
      <View style={[styles.shell, { height: Math.min(PHONE.height + 32, height - 48) }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 44, backdropFilter: 'blur(10px)' } as object]} />
        <View style={styles.screen}>{children}</View>
        <View pointerEvents="none" style={styles.ring} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  desk: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#557C86', overflow: 'hidden' },
  shell: {
    width: PHONE.width + 32,
    padding: 16,
    borderRadius: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    boxShadow: 'inset 0px 1px 0px rgba(255, 255, 255, 0.75), inset 0px 0px 0px 6px rgba(255, 255, 255, 0.07), 0px 30px 90px rgba(12, 34, 80, 0.28)',
  },
  screen: { flex: 1, borderRadius: 32, overflow: 'hidden', backgroundColor: '#081721' },
  ring: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
});
