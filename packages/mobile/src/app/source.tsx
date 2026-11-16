import type { ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firstName, friendById } from '../people';
import { BackButton, BigButton, ChatBubble, ChatPanel, DesignFonts, EmojiAvatar, Eyebrow, fillFor, Glass, Icon, radii, Screen, space, sym, TopBar, Txt } from '@/design';
import { sourceById } from '../api/sources';
import { chatLabel, senderLabel, type Source as LiveMessage } from '../api/client';
import { formatSent } from '../lib/answer';

const links: Record<string, { app: string; web: string }> = {
  iMessage: { app: 'sms:', web: 'sms:' },
  Instagram: { app: 'instagram://direct-inbox', web: 'https://www.instagram.com/direct/inbox/' },
  WhatsApp: { app: 'whatsapp://', web: 'https://web.whatsapp.com' },
};

/** The modal's glass top bar: a close button where a pushed screen has back. */
function CloseBar() {
  return <TopBar leading={<BackButton icon={sym('xmark', 'close')} />} />;
}

/** A source page on the calm-horizon photograph, under the close bar. */
function SourceScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <DesignFonts>
      <Screen scene="sky" scrim={0.12} contentStyle={{ paddingTop: insets.top + 76 }} overlay={<CloseBar />}>
        {children}
      </Screen>
    </DesignFonts>
  );
}

/** Who a message is from, big: avatar, a Spencer name and what kind of chat it is. */
function Who({ name, detail, group }: { name: string; detail: string; group?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
      {group ? <EmojiAvatar emoji="👥" color={fillFor(group)} size={60} /> : <EmojiAvatar name={name} size={60} />}
      <View style={{ gap: 4, flex: 1 }}>
        <Eyebrow text={detail} />
        <Txt variant="title1" accessibilityRole="header" numberOfLines={2}>
          {name}
        </Txt>
      </View>
    </View>
  );
}

function Provenance() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xs }}>
      <Glass tone="light" radius={20} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={sym('lock.fill', 'lock')} size={16} />
      </Glass>
      <Txt variant="footnote" tone="secondary" shadow style={{ flex: 1 }}>
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
    <SourceScreen>
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
      <BigButton title={message.service === 'iMessage' ? 'Open in Messages' : `Open in ${message.service}`} trailing="↗" onPress={open} />
      <Provenance />
    </SourceScreen>
  );
}

/** A message from the API (a fact, plan, moment or answer receipt), quoted as a bubble in its chat. */
function LiveSource({ message, quote }: { message: LiveMessage; quote?: string }) {
  const name = message.isDm && !message.fromMe ? message.sender : message.isDm ? chatLabel(message) : message.chat;
  const q = quote?.trim();
  return (
    <SourceScreen>
      <Who name={name} detail={message.isDm ? 'Your DM' : 'Group chat'} group={message.isDm ? undefined : message.chatId} />
      {q && q !== message.text.trim() ? (
        <Glass tone="dark" radius={radii.xl} style={{ gap: space.sm, padding: space.lg }}>
          <View style={{ position: 'absolute', left: 0, top: space.lg, bottom: space.lg, width: 3, borderRadius: 2, backgroundColor: '#FF2CAB' }} />
          <Eyebrow text="The part that mattered" color="#FF7BCB" />
          <Txt variant="title2">“{q}”</Txt>
        </Glass>
      ) : null}
      <ChatPanel>
        <ChatBubble mine={message.fromMe} name={senderLabel(message)} text={message.text} time={formatSent(message.sentAt)} highlighted />
      </ChatPanel>
      <Provenance />
    </SourceScreen>
  );
}
