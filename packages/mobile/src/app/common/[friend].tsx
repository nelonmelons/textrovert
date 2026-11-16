import { ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { useFriend } from '../../api/people';
import { firstName } from '../../people';
import { DesignFonts, geist, Screen, space, Txt, useDesign } from '@/design';
import { CommonGround } from '../../features/common/CommonGround';

/** /common/[friend]: what you and a friend have in common, if they use Textrovert too and you both opt in. */
export default function CommonGroundScreen() {
  const { friend: id } = useLocalSearchParams<{ friend: string }>();
  const { friend, status } = useFriend(id);
  const { c } = useDesign();
  return (
    <DesignFonts>
      <Stack.Screen
        options={{
          headerTitle: 'In common',
          headerStyle: { backgroundColor: c.background },
          headerTitleStyle: { color: c.text, fontFamily: geist['600'] },
          headerTintColor: c.accentText,
        }}
      />
      <Screen contentStyle={{ paddingTop: space.lg, paddingBottom: space.huge }}>
        {friend ? (
          <CommonGround friendId={friend.id} first={firstName(friend)} />
        ) : status === 'loading' ? (
          <ActivityIndicator style={{ marginTop: space.huge }} />
        ) : (
          <Txt variant="body" tone="secondary">
            No one by that name in your chats.
          </Txt>
        )}
      </Screen>
    </DesignFonts>
  );
}
