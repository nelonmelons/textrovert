import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme } from '@/theme';

const icon = (name: SymbolViewProps['name']) =>
  function TabIcon({ color }: { color: unknown }) {
    return <SymbolView name={name} tintColor={color as string} size={24} />;
  };

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarActiveTintColor: theme.ask.ink,
        tabBarInactiveTintColor: theme.secondary,
        tabBarStyle: { backgroundColor: theme.panel, borderTopColor: theme.gridMajor, ...(Platform.OS === 'web' ? { height: 62, paddingBottom: 8 } : null) },
        tabBarLabelStyle: { fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.paper },
      }}>
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon({ ios: 'sun.max', android: 'wb_sunny', web: 'wb_sunny' }) }} />
      <Tabs.Screen name="index" options={{ title: 'Ask', tabBarIcon: icon({ ios: 'bubble.left.and.text.bubble.right', android: 'forum', web: 'forum' }) }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends', tabBarIcon: icon({ ios: 'person.2', android: 'group', web: 'group' }) }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: icon({ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }) }} />
    </Tabs>
  );
}
