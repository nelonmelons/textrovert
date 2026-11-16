import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { fonts } from '../../design/fonts';
import { ditto } from '../../design/tokens';

const icon = (name: SymbolViewProps['name']) =>
  function TabIcon({ color }: { color: unknown }) {
    return <SymbolView name={name} tintColor={color as string} size={24} weight="semibold" />;
  };

/**
 * Ditto's tab bar: no surface, just white icons and 11px labels floating over the photograph (35% white at rest, solid
 * white when active), with a soft navy fade underneath so they stay legible on bright sky.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.45)',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          ...(Platform.OS === 'web' ? { height: 68, paddingBottom: 10, paddingTop: 6 } : null),
        },
        tabBarBackground: () => <LinearGradient colors={['rgba(8, 23, 33, 0)', 'rgba(8, 23, 33, 0.6)', 'rgba(8, 23, 33, 0.82)']} locations={[0, 0.45, 1]} style={[StyleSheet.absoluteFill, { top: -36 }]} pointerEvents="none" />,
        tabBarLabelStyle: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 11 },
        tabBarHideOnKeyboard: Platform.OS === 'android',
        sceneStyle: { backgroundColor: ditto.nu7 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon({ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }) }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask', tabBarIcon: icon({ ios: 'bubble.left.and.text.bubble.right.fill', android: 'forum', web: 'forum' }) }} />
      <Tabs.Screen name="people" options={{ title: 'People', tabBarIcon: icon({ ios: 'person.2.fill', android: 'group', web: 'group' }) }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon({ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }) }} />
    </Tabs>
  );
}
