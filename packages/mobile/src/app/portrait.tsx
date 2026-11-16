import { Stack, useLocalSearchParams } from 'expo-router';
import { NIGHT, Portrait } from '../features/portrait/Portrait';

/** The portrait on its own, for deep links like a friend's topic: /portrait?view=atlas/t/<topic>. */
export default function PortraitRoute() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const title = view?.startsWith('atlas/t/') ? decodeURIComponent(view.slice(8)) : view === 'atlas' ? 'Your topics' : 'Your network';
  return (
    <>
      <Stack.Screen options={{ headerTitle: title, headerStyle: { backgroundColor: NIGHT }, headerTintColor: '#FFFFFF', headerTitleStyle: { color: '#FFFFFF', fontWeight: '600' } }} />
      <Portrait view={view ?? 'orbit'} />
    </>
  );
}
