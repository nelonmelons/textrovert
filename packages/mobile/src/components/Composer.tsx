import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, shadow, type, useTheme, type Tone } from '@/theme';

/** The bottom composer: an accessory row (scope chips) above a capsule field with a round send button. */
export function Composer({
  placeholder,
  onSend,
  disabled,
  tone,
  accessory,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  disabled?: boolean;
  tone?: Tone;
  accessory?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const t = tone ?? theme.tones.accent;
  const canSend = !disabled && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <View style={[styles.panel, shadow.lifted, { backgroundColor: theme.panel, paddingBottom: 8 + Math.min(insets.bottom, 8) }]}>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: t.ink, borderWidth: focused ? 2 : 1 }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={theme.secondary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={send}
          submitBehavior="submit"
          returnKeyType="send"
          multiline
          numberOfLines={1}
          aria-label={placeholder}
          style={[type.body, styles.input, { color: theme.ink }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          onKeyPress={(e) => {
            const key = e.nativeEvent as { key: string; shiftKey?: boolean };
            if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Pressable accessibilityRole="button" aria-label="Send" onPress={send} disabled={!canSend} style={[styles.send, { backgroundColor: t.ink, opacity: canSend ? 1 : 0.4 }]}>
          <Text style={styles.arrow}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingTop: 12, gap: 10, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  accessory: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.bubble + 4, paddingLeft: 16, paddingRight: 4, paddingVertical: 4 },
  input: { flex: 1, maxHeight: 110, paddingVertical: 7 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  arrow: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 20 },
});
