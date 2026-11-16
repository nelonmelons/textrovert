import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop, TopBar } from '@/design';
import { Portrait } from '../features/portrait/Portrait';

/** The portrait on its own, for deep links like a friend's topic: /portrait?view=atlas/t/<topic>. */
export default function PortraitRoute() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const insets = useSafeAreaInsets();
  const title = view?.startsWith('atlas/t/') ? decodeURIComponent(view.slice(8)) : view === 'atlas' ? 'Your topics' : 'Your network';
  return (
    <View style={{ flex: 1 }}>
      <Backdrop scene="twilight" scrim={0.55} />
      <View style={{ flex: 1, paddingTop: insets.top + 64 }}>
        <Portrait view={view ?? 'orbit'} />
      </View>
      <TopBar title={title} />
    </View>
  );
}
