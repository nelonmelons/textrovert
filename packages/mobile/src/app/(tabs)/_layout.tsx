import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Glass } from '../../design/Backdrop';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { fonts } from '../../design/fonts';
import { ditto } from '../../design/tokens';

const icon = (name: SymbolViewProps['name']) =>
  function TabIcon({ color }: { color: unknown }) {
    return <SymbolView name={name} tintColor={color as string} size={24} weight="semibold" />;
  };

/**
 * The tab bar as a floating capsule of the frontpage's form glass (white/10, blur 10, a white lit rim), white icons and
 * labels, the active tab solid white.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.55)',
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          marginHorizontal: 16,
          bottom: Platform.OS === 'web' ? 12 : 24,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          borderRadius: 32,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () => <Glass tone="light" radius={32} style={StyleSheet.absoluteFill} />,
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
