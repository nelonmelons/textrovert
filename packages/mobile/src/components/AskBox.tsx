import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Friend, firstName } from '../people';
import { fonts, Glass, Icon, sym, Txt, useDesign } from '@/design';
import { AskAvatar } from '../features/ask/AskAvatar';

/** Ask about one friend, inline on their profile: the pink hedgehog greeting over a Ditto input with a pink send. */
export function AskBox({ friend, ask }: { friend: Friend; ask: (question: string) => void }) {
  const { c, shadow } = useDesign();
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const send = () => {
    if (!trimmed) return;
    setText('');
    ask(trimmed);
  };
  return (
    <Glass tone="dark" radius={28} style={styles.box}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <AskAvatar size={32} />
        <View style={styles.greeting}>
          <Txt variant="subhead" style={{ fontSize: 15, lineHeight: 20 }}>
            Hi! Ask me anything about your chats with {firstName(friend)}.
          </Txt>
        </View>
      </View>
      <View style={[styles.field, { backgroundColor: c.input, borderColor: c.edge }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          returnKeyType="send"
          placeholder={`Ask about ${firstName(friend)}…`}
          placeholderTextColor={c.placeholder}
          style={[{ flex: 1, color: c.text, paddingVertical: 10, fontFamily: fonts.ui, fontSize: 16 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
        />
        <Pressable
          onPress={send}
          disabled={!trimmed}
          accessibilityRole="button"
          accessibilityLabel="Ask"
          style={[styles.send, { backgroundColor: trimmed ? c.accent : 'rgba(255, 255, 255, 0.1)', boxShadow: trimmed ? shadow.glow : undefined }]}>
          <Icon name={sym('arrow.up', 'arrow_upward')} size={16} weight="bold" color={trimmed ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'} />
        </Pressable>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  box: { gap: 14, padding: 16 },
  greeting: {
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 20,
    borderBottomLeftRadius: 6,
  },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4, borderRadius: 24, borderWidth: 0.5, minHeight: 48 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
