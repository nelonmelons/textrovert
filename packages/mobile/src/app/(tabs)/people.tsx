import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PeopleList } from '../../features/people/PeopleList';
import { Portrait } from '../../features/portrait/Portrait';
import { Segmented } from '../../components/Segmented';
import { TabHeader } from '../../components/TabHeader';

type Mode = 'list' | 'graph';

/** People: everyone you text as a list, or as the network graph (the portrait's orbit, with groups and edges). */
export default function People() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'graph' ? 'graph' : 'list');
  const graph = mode === 'graph';
  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="People" dark={graph}>
        <Segmented
          dark={graph}
          value={mode}
          onChange={setMode}
          options={[
            { id: 'list', label: 'List' },
            { id: 'graph', label: 'Network' },
          ]}
        />
      </TabHeader>
      {graph ? <Portrait view="orbit" /> : <PeopleList />}
    </View>
  );
}
