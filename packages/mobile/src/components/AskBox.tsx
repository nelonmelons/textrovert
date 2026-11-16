import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Friend, firstName } from '../people';
import { Bubble, Field, FormCard, Icon, sym } from '@/design';

/** Ask about one friend, inline: a Messages greeting over the Enroll field with a white send key. */
export function AskBox({ friend, ask }: { friend: Friend; ask: (question: string) => void }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const send = () => {
    if (!trimmed) return;
    setText('');
    ask(trimmed);
  };
  return (
    <FormCard>
      <Bubble text={`Hi! Ask me anything about your chats with ${firstName(friend)}.`} />
      <View style={{ height: 4 }} />
      <Field
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        returnKeyType="send"
        placeholder={`Ask about ${firstName(friend)}…`}
        trailing={
          <Pressable onPress={send} disabled={!trimmed} accessibilityRole="button" accessibilityLabel="Ask" style={{ width: 34, height: 34, borderRadius: 17, marginRight: -10, alignItems: 'center', justifyContent: 'center', backgroundColor: trimmed ? '#FFFFFF' : 'rgba(255, 255, 255, 0.2)' }}>
            <Icon name={sym('arrow.up', 'arrow_upward')} size={15} weight="bold" color={trimmed ? '#081721' : 'rgba(255, 255, 255, 0.6)'} />
          </Pressable>
        }
      />
    </FormCard>
  );
}
