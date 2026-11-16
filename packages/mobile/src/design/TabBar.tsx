import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from './haptics';
import { useDesign } from './theme';
import { Txt } from './Txt';
import { radii, space } from './tokens';

export interface TabItem {
  key: string;
  label: string;
  emoji: string;
}

/** Height a screen should leave clear at the bottom for the floating tab bar. */
export const TAB_BAR_SPACE = 96;

/**
 * The floating glass tab bar: a frosted capsule (system material blur on native, CSS backdrop blur on web) with emoji tabs; the
 * active one sits on a soft pill.
 */
export function TabBar({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange?: (key: string) => void }) {
  const { c, scheme, shadow } = useDesign();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, space.md), alignItems: 'center' }}>
      <View role="tablist" style={{ flexDirection: 'row', padding: 5, gap: 2, borderRadius: radii.pill, overflow: 'hidden', borderWidth: 0.5, borderColor: c.tabBarEdge, boxShadow: shadow.card }}>
        {Platform.OS === 'web' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.tabBar, backdropFilter: 'blur(20px) saturate(180%)' } as object]} />
        ) : (
          <BlurView intensity={60} tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={[StyleSheet.absoluteFill, { backgroundColor: c.tabBar }]} />
        )}
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Pressable
              key={t.key}
              role="tab"
              aria-selected={on}
              aria-label={t.label}
              onPress={() => {
                haptics.select();
                onChange?.(t.key);
              }}
              style={{ width: 74, height: 52, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: on ? c.fill : 'transparent' }}>
              <Txt style={{ fontSize: 20, lineHeight: 24, opacity: on ? 1 : 0.55 }}>{t.emoji}</Txt>
              <Txt variant="caption" style={{ fontSize: 10, fontWeight: '600' }} color={on ? c.text : c.textSecondary}>
                {t.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
