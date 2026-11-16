import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Chip, ChatBubble, ChatPanel, EmojiAvatar, Header, ListRow, ListSection, PillButton, ScanHighlight, Screen, Sheet, TAB_BAR_SPACE, Txt, useDesign, radii, space } from '@/design';
import { mascot } from './data';

const receipts = [
  { name: 'Mira Okafor', chat: 'Cabin crew 🏕️', time: 'Thu 21:04', text: 'ok cabin is booked!! fri to sun, bring snacks' },
  { name: 'Theo Lindqvist', chat: 'Cabin crew 🏕️', time: 'Thu 21:06', text: 'im driving, can fit 3 + the cooler' },
  { name: 'Mira Okafor', chat: 'Mira', time: 'Fri 09:12', text: 'can you grab the tent from sami?' },
];

export function AskMockup({ sheetOpen = false, tabBar }: { sheetOpen?: boolean; tabBar?: ReactNode }) {
  const { c } = useDesign();
  const [open, setOpen] = useState(sheetOpen);
  return (
    <Screen
      bottomInset={TAB_BAR_SPACE}
      overlay={
        <>
          {tabBar}
          <Sheet visible={open} onClose={() => setOpen(false)} emoji="🧾" title="Receipts" subtitle="3 messages from 2 chats">
          <ChatPanel>
            {receipts.map((r, i) => (
              <ChatBubble key={i} name={r.name} text={r.text} time={r.time} highlighted={i === 0} />
            ))}
          </ChatPanel>
          <ListSection header="Open in chat">
            <ListRow title="Cabin crew" subtitle="4 people · 2 messages" leading={<EmojiAvatar emoji="🏕️" color="mint" size={36} />} onPress={() => {}} />
            <ListRow title="Mira Okafor" subtitle="1 message" leading={<EmojiAvatar name="Mira Okafor" size={36} />} onPress={() => {}} />
          </ListSection>
          </Sheet>
        </>
      }>
      <Header leading={<EmojiAvatar {...mascot} size={40} />} title="Ask" trailing={<PillButton title="New" emoji="✏️" kind="secondary" small onPress={() => {}} />} />
      <ChatPanel>
        <ChatBubble mine text="what's the plan for the cabin this weekend?" time="10:41" />
        <ScanHighlight avatar={mascot} rest={0.42}>
          <View style={{ gap: space.sm }}>
            <ChatBubble name="Textrovert" time="10:41">
              <Txt variant="callout" color={c.bubbleText}>
                Mira booked it for Fri to Sun 🏕️ and Theo is driving with room for 3 plus the cooler. You're on tent duty: Mira asked you to grab it from Sami.
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
                <Chip label="Cabin crew" emoji="🏕️" count={2} tint="mint" onPress={() => setOpen(true)} />
                <Chip label="Mira" emoji="💬" count={1} tint="pink" onPress={() => setOpen(true)} />
              </View>
            </ChatBubble>
            <ChatBubble mine text="ugh the tent. ok who has it rn" time="10:42" />
            <ChatBubble name="Textrovert" text="Sami, since the August trip ⛺️ Want me to draft a nudge?" time="10:42" highlighted />
          </View>
        </ScanHighlight>
      </ChatPanel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Chip label="Draft the nudge" emoji="✍️" onPress={() => {}} />
        <Chip label="Who's coming?" emoji="👀" onPress={() => {}} />
        <Chip label="Show receipts" emoji="🧾" onPress={() => setOpen(true)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingLeft: space.lg, paddingRight: 5, borderRadius: radii.pill, backgroundColor: c.fill }}>
        <Txt variant="body" tone="tertiary" style={{ flex: 1 }}>
          Ask about your people…
        </Txt>
        <PillButton title="Ask" emoji="↑" small onPress={() => {}} />
      </View>
    </Screen>
  );
}
