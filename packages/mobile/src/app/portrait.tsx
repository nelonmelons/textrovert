import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { DesignFonts, SegmentedControl, space, useDesign } from '@/design';
import { Portrait } from '../features/portrait/Portrait';

const title = (view: string) => (view.startsWith('atlas/t/') ? decodeURIComponent(view.slice(8)) : view === 'atlas' ? 'Your topics' : 'Your network');

/** The portrait on its own: the network (orbit) or your topics (atlas), and deep links like /portrait?view=atlas/t/<topic>. */
export default function PortraitRoute() {
  const { c } = useDesign();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState(params.view ?? 'orbit');
  const topics = view.startsWith('atlas');
  return (
    <DesignFonts>
      <Stack.Screen options={{ headerTitle: title(view), headerStyle: { backgroundColor: c.background }, headerTintColor: c.accentText, headerTitleStyle: { color: c.text, fontFamily: 'Geist_600SemiBold' } }} />
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ paddingHorizontal: space.gutter, paddingBottom: space.md }}>
          <SegmentedControl segments={['Network', 'Topics']} value={topics ? 1 : 0} onChange={(i) => setView(i ? 'atlas' : 'orbit')} />
        </View>
        <Portrait view={view} />
      </View>
    </DesignFonts>
  );
}
