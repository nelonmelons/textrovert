import { Linking, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { firstName, friendById } from '../people';
import { Theme, Type } from '../theme';
import { Bubble, Face, RowChevron, ServiceIcon, SourceHeader, Symbol } from '../components/Paper';
import { sourceById } from '../api/sources';
import { chatLabel, senderLabel, type Source as LiveMessage } from '../api/client';
import { initials } from '../api/people';
import { formatSent } from '../lib/answer';
import { PaperScroll } from '../components/PaperScroll';

const links: Record<string, { app: string; web: string }> = {
  iMessage: { app: 'sms:', web: 'sms:' },
  Instagram: { app: 'instagram://direct-inbox', web: 'https://www.instagram.com/direct/inbox/' },
  WhatsApp: { app: 'whatsapp://', web: 'https://web.whatsapp.com' },
};

export default function Source() {
  const { friend: friendID, message: messageID, profile, live, quote } = useLocalSearchParams<{ friend: string; message: string; profile?: string; live?: string; quote?: string }>();
  const liveMessage = sourceById(live);
  if (liveMessage) return <LiveSource message={liveMessage} quote={quote} />;
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
              router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
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

const doneButton = () => (
  <Pressable onPress={() => router.back()} hitSlop={10}>
    <Text style={[Type.body, { color: Theme.accent, fontWeight: '600' }]}>Done</Text>
  </Pressable>
);

/** A message from the API (a fact, plan, moment or story footnote), in the same sheet as Emma's fixture sources. */
function LiveSource({ message, quote }: { message: LiveMessage; quote?: string }) {
  const title = chatLabel(message);
  const who = senderLabel(message);
  return (
    <>
      <Stack.Screen options={{ headerRight: doneButton }} />
      <PaperScroll contentContainerStyle={{ padding: 24, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Face initials={initials(message.isDm && !message.fromMe ? message.sender : message.chat)} />
          <View style={{ gap: 2, flex: 1 }}>
            <Text style={[Type.title3, { fontWeight: '700', color: Theme.ink }]}>{title}</Text>
            {message.isDm ? null : <Text style={[Type.subheadline, { color: Theme.secondary }]}>Group chat</Text>}
          </View>
        </View>
        {quote && quote.trim() && quote.trim() !== message.text.trim() ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 3, borderRadius: 2, backgroundColor: Theme.accent }} />
            <Text style={[Type.body, { flex: 1, color: Theme.ink, fontStyle: 'italic' }]}>“{quote.trim()}”</Text>
          </View>
        ) : null}
        <Bubble text={message.text} meta={`${who} · ${formatSent(message.sentAt)}`} service="iMessage" fromMe={message.fromMe} cited />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ServiceIcon service="iMessage" />
          <Text style={[Type.footnote, { color: Theme.secondary, flex: 1 }]}>Word for word from your imported chats. It stays on your devices.</Text>
        </View>
      </PaperScroll>
    </>
  );
}
