import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Theme } from '../../theme';

const icon = (name: SymbolViewProps['name']) =>
  function TabIcon({ color }: { color: unknown }) {
    return <SymbolView name={name} tintColor={color as string} size={24} />;
  };

/** Today, Ask, People (list and network) and You (stats and topics); everything else pushes over them. */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Theme.accent,
        tabBarInactiveTintColor: Theme.secondary,
        tabBarStyle: { backgroundColor: Theme.panel, borderTopColor: Theme.gridMajor, ...(Platform.OS === 'web' ? { height: 62, paddingBottom: 8 } : null) },
        tabBarLabelStyle: { fontWeight: '600' },
        tabBarHideOnKeyboard: Platform.OS === 'android',
        sceneStyle: { backgroundColor: Theme.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon({ ios: 'sun.max', android: 'wb_sunny', web: 'wb_sunny' }) }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask', tabBarIcon: icon({ ios: 'bubble.left.and.text.bubble.right', android: 'forum', web: 'forum' }) }} />
      <Tabs.Screen name="people" options={{ title: 'People', tabBarIcon: icon({ ios: 'person.2', android: 'group', web: 'group' }) }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon({ ios: 'chart.bar', android: 'insights', web: 'insights' }) }} />
    </Tabs>
  );
}
