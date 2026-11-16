import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { useDittoFonts } from '../design/fonts';
import { ditto } from '../design/tokens';
import { NotesProvider } from '../store';
import { FirstRunProvider } from '../firstRun';
import { DataModeProvider } from '../api/mode';
import { PhoneFrame } from '../components/PhoneFrame';
import { SheetProvider } from '../components/Sheet';

export { ErrorBoundary } from 'expo-router';

/**
 * Every screen draws its own Ditto photograph and its own glass top bar, so the stack has no native headers; the navy
 * canvas only shows while a photograph loads.
 */
export default function RootLayout() {
  const loaded = useDittoFonts();
  if (!loaded) return <View style={{ flex: 1, backgroundColor: ditto.nu7 }} />;
  return (
    <SafeAreaProvider>
      <PhoneFrame>
        <DataModeProvider>
          <FirstRunProvider>
            <NotesProvider>
              <SheetProvider>
                <StatusBar style="light" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ditto.nu7 }, animation: 'slide_from_right' }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="setup" options={{ gestureEnabled: false, animation: 'fade' }} />
                  <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
                  <Stack.Screen name="friend/[id]" />
                  <Stack.Screen name="source" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="note" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="chat" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="wrapped/[conversationId]" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="stats" />
                  <Stack.Screen name="portrait" />
                </Stack>
              </SheetProvider>
            </NotesProvider>
          </FirstRunProvider>
        </DataModeProvider>
      </PhoneFrame>
    </SafeAreaProvider>
  );
}
