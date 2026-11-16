import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Friend, firstName } from '../fixtures';
import { Theme, Type, withAlpha } from '../theme';
import { HedgehogAvatar, Symbol } from './Paper';

export function AskBox({ friend, ask }: { friend: Friend; ask: (question: string) => void }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const trimmed = text.trim();
  const send = () => {
    if (!trimmed) return;
    setText('');
    ask(trimmed);
  };
  return (
    <View style={styles.box}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <HedgehogAvatar />
        <View style={styles.greeting}>
          <Text style={[Type.subheadline, { color: Theme.ink }]}>Hi! Ask me anything about your chats with {firstName(friend)}.</Text>
        </View>
      </View>
      <View style={[styles.field, { borderWidth: focused ? 2 : 1.25 }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={send}
          returnKeyType="send"
          placeholder={`Ask about ${firstName(friend)}…`}
          placeholderTextColor={Theme.secondary}
          style={[Type.body, { flex: 1, color: Theme.ink, paddingVertical: 10 }]}
        />
        <Pressable onPress={send} disabled={!trimmed} accessibilityLabel="Ask" style={[styles.send, { opacity: trimmed ? 1 : 0.4 }]}>
          <Symbol name="arrow.up" size={14} color="#FFFFFF" weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: Theme.panel, borderWidth: 1.5, borderColor: withAlpha(Theme.accent, 0.5) },
  greeting: { flexShrink: 1, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Theme.secondaryBackground, borderRadius: 18, borderTopLeftRadius: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4, borderRadius: 26, borderColor: Theme.accent, backgroundColor: Theme.background },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.accent, margin: 5 },
});
