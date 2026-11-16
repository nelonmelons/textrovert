import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nativeDriver, useReducedMotion } from '@/lib/motion';
import { fonts } from '@/design/fonts';
import { radius, titleShadow, Type } from '@/theme';

interface SheetContent {
  title: string;
  /** A muted line under the title. */
  subtitle?: string;
  /** An emoji before the title. */
  emoji?: string;
  content: ReactNode;
}
interface SheetApi {
  open: (sheet: SheetContent) => void;
  close: () => void;
}
const SheetContext = createContext<SheetApi>({ open: () => {}, close: () => {} });
export const useSheet = () => useContext(SheetContext);

/**
 * Hosts one bottom sheet over everything inside it, tab bar included: Ditto's navy glass card floating 8pt off the
 * edges, a Spencer title and a glass close button. Rendered in the app root (inside the web phone frame) so sheets
 * stay within the phone on wide screens. Screens open one with useSheet().open.
 */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetContent | null>(null);
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
      {sheet && shown ? (
        <SheetView title={sheet.title} subtitle={sheet.subtitle} emoji={sheet.emoji} progress={progress} reduced={reduced} onClose={close}>
          {sheet.content}
        </SheetView>
      ) : null}
    </SheetContext.Provider>
  );
}

function SheetView({ title, subtitle, emoji, progress, reduced, onClose, children }: { title: string; subtitle?: string; emoji?: string; progress: Animated.Value; reduced: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 600, 0], extrapolateRight: 'clamp' });
  const opacity = reduced ? progress : 1;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 12, 18, 0.55)', opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
        <Pressable accessibilityRole="button" aria-label="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.dock}>
      <Animated.View aria-modal role="dialog" style={[styles.sheet, { paddingBottom: insets.bottom + 12, opacity, transform: [{ translateY }] }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          {emoji ? <Text style={{ fontSize: 26, lineHeight: 32 }}>{emoji}</Text> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={[Type.title2, titleShadow, { color: '#FFFFFF', fontFamily: fonts.serif }]}>
              {title}
            </Text>
            {subtitle ? <Text style={[Type.footnote, { color: 'rgba(255, 255, 255, 0.72)' }]}>{subtitle}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" aria-label="Close" onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={[Type.subheadline, { color: '#FFFFFF', fontWeight: '700' }]}>✕</Text>
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
  sheet: {
    maxHeight: '82%',
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: radius.sheet,
    backgroundColor: 'rgba(8, 23, 33, 0.92)',
    borderWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    borderLeftColor: 'rgba(255, 255, 255, 0.2)',
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    boxShadow: '0px 24px 48px rgba(4, 12, 18, 0.4)',
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.28)', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 16 },
});
