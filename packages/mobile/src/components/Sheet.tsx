import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, type, useTheme } from '@/theme';

interface SheetApi {
  open: (sheet: { title: string; content: ReactNode }) => void;
  close: () => void;
}
const SheetContext = createContext<SheetApi>({ open: () => {}, close: () => {} });
export const useSheet = () => useContext(SheetContext);

/**
 * Hosts one bottom sheet over everything inside it, tab bar included. Rendered in the app root (inside the web phone
 * frame) so sheets stay within the phone on wide screens. Screens open one with useSheet().open.
 */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<{ title: string; content: ReactNode } | null>(null);
  const [shown, setShown] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (!sheet) return;
    setShown(true);
    Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: native }).start();
  }, [sheet, progress, native]);

  const close = useCallback(() => {
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: native }).start(() => {
      setShown(false);
      setSheet(null);
    });
  }, [progress, native]);
  const api = useMemo<SheetApi>(() => ({ open: setSheet, close }), [close]);

  return (
    <SheetContext.Provider value={api}>
      {children}
      {sheet && shown ? <SheetView title={sheet.title} progress={progress} onClose={close}>{sheet.content}</SheetView> : null}
    </SheetContext.Provider>
  );
}

function SheetView({ title, progress, onClose, children }: { title: string; progress: Animated.Value; onClose: () => void; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20, 14, 10, 0.35)', opacity: progress }]}>
        <Pressable accessibilityRole="button" aria-label="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View aria-modal role="dialog" style={[styles.sheet, { backgroundColor: theme.panel, paddingBottom: insets.bottom + 12, transform: [{ translateY }] }]}>
        <View style={[styles.grabber, { backgroundColor: theme.fillTertiary }]} />
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[type.title3, { color: theme.ink, flex: 1 }]}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" aria-label="Done" onPress={onClose} hitSlop={10}>
            <Text style={[type.headline, { color: theme.ask.ink }]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 16 },
});
