import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { Theme } from '../theme';
import { NotesProvider } from '../store';
import { FirstRunProvider } from '../firstRun';

export default function RootLayout() {
  const [loaded] = useFonts({ Nunito_700Bold, Nunito_800ExtraBold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: Theme.paper }} />;
  return (
    <SafeAreaProvider>
      <FirstRunProvider>
        <NotesProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Theme.paper },
              headerStyle: { backgroundColor: Theme.paper },
              headerShadowVisible: false,
              headerTintColor: Theme.accent,
              headerTitle: '',
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="setup" options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="friend/[id]" options={{ headerShown: true }} />
            <Stack.Screen name="source" options={{ headerShown: true, presentation: 'modal' }} />
            <Stack.Screen name="note" options={{ headerShown: true, presentation: 'modal' }} />
            <Stack.Screen name="chat" options={{ headerShown: true }} />
            <Stack.Screen name="settings" options={{ headerShown: true }} />
          </Stack>
        </NotesProvider>
      </FirstRunProvider>
    </SafeAreaProvider>
  );
}
