import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { Theme } from '../theme';
import { NotesProvider } from '../store';

export default function RootLayout() {
  const [loaded] = useFonts({ Nunito_700Bold, Nunito_800ExtraBold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: Theme.paper }} />;
  return (
    <SafeAreaProvider>
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
          <Stack.Screen name="friend/[id]" options={{ headerShown: true }} />
          <Stack.Screen name="source" options={{ headerShown: true, presentation: 'modal' }} />
          <Stack.Screen name="note" options={{ headerShown: true, presentation: 'modal' }} />
          <Stack.Screen name="chat" options={{ headerShown: true }} />
          <Stack.Screen name="analysis" options={{ headerShown: true }} />
          <Stack.Screen name="conversation" options={{ headerShown: true, presentation: 'modal' }} />
        </Stack>
      </NotesProvider>
    </SafeAreaProvider>
  );
}
