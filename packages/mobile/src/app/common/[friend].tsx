import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useFriend } from '../../api/people';
import { firstName } from '../../people';
import { DesignFonts, Glass, Screen, space, Txt } from '@/design';
import { CommonGround } from '../../features/common/CommonGround';

/** /common/[friend]: what you and a friend have in common, if they use Textrovert too and you both opt in. */
export default function CommonGroundScreen() {
  const { friend: id } = useLocalSearchParams<{ friend: string }>();
  const { friend, status } = useFriend(id);
  return (
    <DesignFonts>
      <Screen back title="In common" contentStyle={{ gap: space.lg }}>
        {friend ? (
          <CommonGround friendId={friend.id} first={firstName(friend)} />
        ) : status === 'loading' ? (
          <ActivityIndicator color="#FFFFFF" style={{ marginTop: space.huge }} />
        ) : (
          <Glass tone="dark" style={{ padding: space.xl }}>
            <Txt variant="callout">No one by that name in your chats.</Txt>
          </Glass>
        )}
      </Screen>
    </DesignFonts>
  );
}
