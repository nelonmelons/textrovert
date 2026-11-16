import { Image, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { art } from '../../components/Paper';
import { PaperScroll } from '../../components/PaperScroll';
import { Rounded, Theme, Type } from '../../theme';

/**
 * Placeholder for a friend's Wrapped. TODO(app-wrapped): nelson/app-wrapped replaces this file with the route wrapper
 * around src/features/wrapped/ (fetchWrapped in src/api/friend.ts). conversationId is the DM's id from GET /friend,
 * or "demo-<fixture id>" in demo mode.
 */
export default function WrappedRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return (
    <PaperScroll contentContainerStyle={{ padding: 24, gap: 16, alignItems: 'center' }}>
      <Stack.Screen options={{ headerTitle: 'Wrapped', headerTitleStyle: { color: Theme.ink, fontWeight: '600' } }} />
      <Image source={art.dance} style={{ width: 200, height: 170, marginTop: 40 }} resizeMode="contain" />
      <Text style={[Type.title2, { fontFamily: Rounded.bold, color: Theme.ink, textAlign: 'center' }]}>Wrapped is on its way</Text>
      <Text style={[Type.body, { color: Theme.secondary, textAlign: 'center' }]}>Your highlights with this friend will play here.</Text>
      <Text style={[Type.caption, { color: Theme.secondary }]}>{conversationId?.startsWith('demo-') ? 'Demo friend' : 'Conversation ' + conversationId}</Text>
    </PaperScroll>
  );
}
