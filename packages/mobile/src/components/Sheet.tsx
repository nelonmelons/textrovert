import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nativeDriver, useReducedMotion } from '@/lib/motion';
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
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!sheet) return;
    setShown(true);
    (reduced
      ? Animated.timing(progress, { toValue: 1, duration: 160, useNativeDriver: nativeDriver })
      : Animated.spring(progress, { toValue: 1, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: nativeDriver })
    ).start();
  }, [sheet, progress, reduced]);

  const close = useCallback(() => {
    Animated.timing(progress, { toValue: 0, duration: reduced ? 140 : 200, useNativeDriver: nativeDriver }).start(() => {
      setShown(false);
      setSheet(null);
    });
  }, [progress, reduced]);
  const api = useMemo<SheetApi>(() => ({ open: setSheet, close }), [close]);

  return (
    <SheetContext.Provider value={api}>
      {children}
      {sheet && shown ? <SheetView title={sheet.title} progress={progress} reduced={reduced} onClose={close}>{sheet.content}</SheetView> : null}
    </SheetContext.Provider>
  );
}

function SheetView({ title, progress, reduced, onClose, children }: { title: string; progress: Animated.Value; reduced: boolean; onClose: () => void; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 600, 0], extrapolateRight: 'clamp' });
  const opacity = reduced ? progress : 1;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20, 14, 10, 0.35)', opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
        <Pressable accessibilityRole="button" aria-label="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.dock}>
      <Animated.View aria-modal role="dialog" style={[styles.sheet, { backgroundColor: theme.panel, paddingBottom: insets.bottom + 12, opacity, transform: [{ translateY }] }]}>
        <View style={[styles.grabber, { backgroundColor: theme.fillTertiary }]} />
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[type.title3, { color: theme.ink, flex: 1 }]}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" aria-label="Done" onPress={onClose} hitSlop={10}>
            <Text style={[type.headline, { color: theme.ask.ink }]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {children}
        </ScrollView>
      </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 16 },
});
