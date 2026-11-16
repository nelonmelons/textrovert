import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop, TAB_BAR_SPACE } from '@/design';
import { PeopleList } from '../../features/people/PeopleList';
import { Portrait } from '../../features/portrait/Portrait';
import { Segmented } from '../../components/Segmented';
import { TabHeader } from '../../components/TabHeader';

type Mode = 'list' | 'graph';

/**
 * People: everyone you text as a list over the open ocean, or as the network graph (the portrait's orbit, with groups
 * and edges) drawn on a darkened blue-hour sky.
 */
export default function People() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'graph' ? 'graph' : 'list');
  const graph = mode === 'graph';
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Backdrop scene={graph ? 'twilight' : 'ocean'} scrim={graph ? 0.55 : 0} />
      <TabHeader title="People">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { id: 'list', label: 'List' },
            { id: 'graph', label: 'Network' },
          ]}
        />
      </TabHeader>
      {graph ? <Portrait view="orbit" bottomInset={TAB_BAR_SPACE + insets.bottom - 24} /> : <PeopleList />}
    </View>
  );
}
