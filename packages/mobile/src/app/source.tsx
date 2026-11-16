import { Image, Linking, Pressable, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { firstName, friendById } from '../people';
import { BigButton, ChatBubble, ChatPanel, DesignFonts, EmojiAvatar, fillFor, geist, Screen, space, Txt, useDesign } from '@/design';
import { sourceById } from '../api/sources';
import { chatLabel, senderLabel, type Source as LiveMessage } from '../api/client';
import { formatSent } from '../lib/answer';

const detective = require('../../assets/art/hedgehog-detective.png');

const links: Record<string, { app: string; web: string }> = {
  iMessage: { app: 'sms:', web: 'sms:' },
  Instagram: { app: 'instagram://direct-inbox', web: 'https://www.instagram.com/direct/inbox/' },
  WhatsApp: { app: 'whatsapp://', web: 'https://web.whatsapp.com' },
};

const doneButton = () => (
  <Pressable onPress={() => router.back()} hitSlop={10}>
    <Txt variant="body" tone="accent" style={{ fontWeight: '600' }}>
      Done
    </Txt>
  </Pressable>
);

/** The modal's header on the design canvas, with Done on the right. */
function SourceHeaderBar() {
  const { c } = useDesign();
  return <Stack.Screen options={{ headerTitle: '', headerStyle: { backgroundColor: c.background }, headerTintColor: c.accentText, headerTitleStyle: { fontFamily: geist['600'] }, headerRight: doneButton }} />;
}

/** Who a message is from, big: avatar, name and what kind of chat it is. */
function Who({ name, detail, group }: { name: string; detail: string; group?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
      {group ? <EmojiAvatar emoji="👥" color={fillFor(group)} size={56} /> : <EmojiAvatar name={name} size={56} />}
      <View style={{ gap: 2, flex: 1 }}>
        <Txt variant="title2" accessibilityRole="header">
          {name}
        </Txt>
        <Txt variant="subhead" tone="secondary">
          {detail}
        </Txt>
      </View>
    </View>
  );
}

function Provenance() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Image source={detective} style={{ width: 64, height: 64 }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Txt variant="footnote" tone="secondary" style={{ flex: 1 }}>
        Word for word from your imported chats. It stays on your devices.
      </Txt>
    </View>
  );
}

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
    <DesignFonts>
      <SourceHeaderBar />
      <Screen contentStyle={{ paddingTop: space.sm }}>
        {profile ? (
          <Pressable
            onPress={() => {
              router.back();
              router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
            }}
            accessibilityHint={`Opens ${firstName(friend)}’s profile`}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, pressed && { opacity: 0.75 }]}>
            <Who name={friend.name} detail={message.service} />
            <Txt variant="title3" tone="tertiary">
              ›
            </Txt>
          </Pressable>
        ) : (
          <Who name={friend.name} detail={message.service} />
        )}
        <ChatPanel>
          <ChatBubble name={friend.name} text={message.text} time={message.date} highlighted />
        </ChatPanel>
        <BigButton title={message.service === 'iMessage' ? 'Open in Messages' : `Open in ${message.service}`} emoji="💬" trailing="↗" onPress={open} />
        <Provenance />
      </Screen>
    </DesignFonts>
  );
}

/** A message from the API (a fact, plan, moment or answer receipt), quoted as a bubble in its chat. */
function LiveSource({ message, quote }: { message: LiveMessage; quote?: string }) {
  const { c } = useDesign();
  const name = message.isDm && !message.fromMe ? message.sender : message.isDm ? chatLabel(message) : message.chat;
  const q = quote?.trim();
  return (
    <DesignFonts>
      <SourceHeaderBar />
      <Screen contentStyle={{ paddingTop: space.sm }}>
        <Who name={name} detail={message.isDm ? 'Your DM' : 'Group chat'} group={message.isDm ? undefined : message.chatId} />
        {q && q !== message.text.trim() ? (
          <View style={{ gap: space.xs, padding: space.lg, borderRadius: 20, borderCurve: 'continuous', backgroundColor: c.accentSoft }}>
            <Txt variant="footnote" tone="accent" style={{ fontWeight: '600' }}>
              🔎 The part that mattered
            </Txt>
            <Txt variant="callout">“{q}”</Txt>
          </View>
        ) : null}
        <ChatPanel>
          <ChatBubble mine={message.fromMe} name={senderLabel(message)} text={message.text} time={formatSent(message.sentAt)} highlighted />
        </ChatPanel>
        <Provenance />
      </Screen>
    </DesignFonts>
  );
}
