import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { SymbolViewProps } from 'expo-symbols';
import { MiaConversation } from '../chat';
import { Theme, Type, withAlpha } from '../theme';
import { Divider, Symbol } from '../components/Paper';

function Card({ title, symbol, color, children }: { title: string; symbol: SymbolViewProps['name']; color: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 16, backgroundColor: withAlpha(color, 0.1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Symbol name={symbol} size={16} color={color} />
        <Text style={[Type.headline, { color: Theme.ink }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Quote({ who, text }: { who: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: Theme.accent }} />
      <View style={{ gap: 2, flex: 1 }}>
        <Text style={[Type.caption, { color: Theme.secondary }]}>{who}</Text>
        <Text style={[Type.body, { color: Theme.ink }]}>“{text}”</Text>
      </View>
    </View>
  );
}

export default function Analysis() {
  const [draft, setDraft] = useState(MiaConversation.reply);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Stack.Screen
        options={{ headerTitle: 'Ask about Mia', headerTitleStyle: { color: Theme.ink, fontWeight: '600' }, headerStyle: { backgroundColor: Theme.background }, contentStyle: { backgroundColor: Theme.background } }}
      />
      <ScrollView style={{ backgroundColor: Theme.background }} contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 60 }} keyboardDismissMode="interactive">
        <View style={{ alignItems: 'flex-end', gap: 6, paddingLeft: 40 }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: Theme.accent }}>
            <Text style={[Type.body, { color: '#FFFFFF', fontWeight: '500' }]}>{MiaConversation.question}</Text>
          </View>
          <Text style={[Type.caption, { color: Theme.secondary }]}>About Nov 14 · iMessage · 5:10–5:41 PM</Text>
        </View>
        <Card title="What I think" symbol="lightbulb.fill" color={Theme.accent}>
          <Text style={[Type.body, { color: Theme.ink, fontWeight: '500' }]}>I think the late notice is the part that bothered her.</Text>
          <Text style={[Type.subheadline, { color: Theme.secondary }]}>She wrote “I wish you’d told me sooner” right after you said you could only stay an hour.</Text>
        </Card>
        <Card title="What I can’t tell" symbol="questionmark.circle.fill" color={Theme.plansTone.ink}>
          <Text style={[Type.body, { color: Theme.ink }]}>
            These words don’t tell me how Mia feels about you overall. She might be frustrated about the timing, or just adjusting plans. Asking her will tell you more than I can.
          </Text>
        </Card>
        <View style={{ gap: 12 }}>
          <Text style={[Type.headline, { color: Theme.ink }]}>Messages this is based on</Text>
          <Quote who="Mia · 5:10 PM" text={MiaConversation.first} />
          <Quote who="Mia · 5:41 PM" text={MiaConversation.last} />
          <Pressable onPress={() => router.push('/conversation')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <Symbol name="bubble.left.and.bubble.right" size={16} color={Theme.ink} />
            <Text style={[Type.subheadline, { color: Theme.ink, fontWeight: '600' }]}>See the full conversation</Text>
          </Pressable>
        </View>
        <Divider />
        <View style={{ gap: 12 }}>
          <Text style={[Type.headline, { color: Theme.ink }]}>A reply you could send</Text>
          {editing ? (
            <TextInput value={draft} onChangeText={(v) => { setDraft(v); setCopied(false); }} multiline autoFocus style={[Type.body, styles.draft, { borderWidth: 1, borderColor: withAlpha(Theme.accent, 0.35) }]} />
          ) : (
            <Text style={[Type.body, styles.draft]}>“{draft}”</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={() => setEditing((e) => !e)} style={[styles.button, { backgroundColor: Theme.accentTone.fill }]}>
              <Symbol name={editing ? 'checkmark' : 'pencil'} size={13} color={Theme.accent} weight="semibold" />
              <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>{editing ? 'Done' : 'Edit'}</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(draft);
                setCopied(true);
              }}
              style={[styles.button, { backgroundColor: Theme.accent }]}
            >
              <Symbol name={copied ? 'checkmark' : 'doc.on.doc'} size={13} color="#FFFFFF" weight="semibold" />
              <Text style={[Type.subheadline, { color: '#FFFFFF', fontWeight: '600' }]}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
          <Text style={[Type.caption, { color: Theme.secondary }]}>I won’t send anything. Copy it into your chat when it sounds like you.</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  draft: { padding: 14, borderRadius: 16, color: Theme.ink, backgroundColor: Theme.secondaryBackground },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 36, borderRadius: 10 },
});
