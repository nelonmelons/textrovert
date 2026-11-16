import { Linking, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { firstName, friendById } from '../people';
import { Theme, Type } from '../theme';
import { Bubble, RowChevron, SourceHeader, Symbol } from '../components/Paper';
import { PaperScroll } from '../components/PaperScroll';

const links: Record<string, { app: string; web: string }> = {
  iMessage: { app: 'sms:', web: 'sms:' },
  Instagram: { app: 'instagram://direct-inbox', web: 'https://www.instagram.com/direct/inbox/' },
  WhatsApp: { app: 'whatsapp://', web: 'https://web.whatsapp.com' },
};

export default function Source() {
  const { friend: friendID, message: messageID, profile } = useLocalSearchParams<{ friend: string; message: string; profile?: string }>();
  const friend = friendById(friendID);
  const message = friend?.messages.find((m) => m.id === messageID);
  if (!friend || !message) return null;

  const open = async () => {
    const link = links[message.service];
    try {
      await Linking.openURL(link.app);
    } catch {
      await Linking.openURL(link.web);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={[Type.body, { color: Theme.accent, fontWeight: '600' }]}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <PaperScroll contentContainerStyle={{ padding: 24, gap: 22 }}>
        {profile ? (
          <Pressable
            onPress={() => {
              router.back();
              router.push(`/friend/${friend.id}`);
            }}
            accessibilityHint={`Opens ${firstName(friend)}’s profile`}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8 }, pressed && { opacity: 0.75 }]}
          >
            <SourceHeader friend={friend} />
            <RowChevron />
          </Pressable>
        ) : (
          <SourceHeader friend={friend} />
        )}
        <Bubble text={message.text} meta={`${firstName(friend)} · ${message.date}`} service={message.service} />
        <Pressable
          onPress={open}
          style={({ pressed }) => [
            { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 20, borderRadius: 24, backgroundColor: Theme.accent },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Symbol name="arrow.up.forward.app" size={16} color="#FFFFFF" weight="semibold" />
          <Text style={[Type.body, { color: '#FFFFFF', fontWeight: '600' }]}>{message.service === 'iMessage' ? 'Open in Messages' : `Open in ${message.service}`}</Text>
        </Pressable>
      </PaperScroll>
    </>
  );
}
