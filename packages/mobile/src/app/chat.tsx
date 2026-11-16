import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firstName, friendById } from '../people';
import { turn, Turn, unavailableReply } from '../chat';
import { Theme, Type } from '../theme';
import { GridPaper, HedgehogAvatar, Symbol } from '../components/Paper';

export default function Chat() {
  const params = useLocalSearchParams<{ friend?: string; q?: string; image?: string }>();
  const friend = friendById(params.friend);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [turns, setTurns] = useState<Turn[]>(() => [
    turn({ fromMe: false, text: friend ? `Hi! Ask me anything about your chats with ${firstName(friend)}, or add a photo.` : 'Hi! Ask me anything about your friends, plans or chats, or add a photo.' }),
  ]);
  const [draft, setDraft] = useState('');
  const [useHistory, setUseHistory] = useState(true);
  const [photo, setPhoto] = useState<string>();
  const [pickError, setPickError] = useState<string>();
  const started = useRef(false);

  const send = (raw: string, image?: string) => {
    const question = raw.trim();
    if (!question && !image) return;
    setDraft('');
    setPhoto(undefined);
    setTurns((t) => [...t, turn({ fromMe: true, text: question, image }), unavailableReply(image)]);
  };

  useEffect(() => {
    if (started.current || (!params.q && !params.image)) return;
    started.current = true;
    send(params.q ?? '', params.image);
  }, [params.q, params.image]);

  const pick = async () => {
    setPickError(undefined);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled) setPhoto(result.assets[0].uri);
    } catch {
      setPickError('That photo couldn’t be loaded. Try another one.');
    }
  };

  const canSend = draft.trim().length > 0 || !!photo;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Theme.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen options={{ headerTitle: friend ? `Ask about ${firstName(friend)}` : 'Ask me', headerTitleStyle: { color: Theme.ink, fontWeight: '600' } }} />
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardDismissMode="interactive">
        <GridPaper width={440} height={3000} />
        {turns.map((t) =>
          t.fromMe ? (
            <View key={t.id} style={{ alignItems: 'flex-end', gap: 6, paddingLeft: 48 }}>
              {t.image ? <Image source={{ uri: t.image }} style={{ width: 140, height: 140, borderRadius: 16 }} accessibilityLabel="Your photo" /> : null}
              {t.text ? (
                <View style={styles.mine}>
                  <Text style={[Type.body, { color: '#FFFFFF' }]}>{t.text}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingRight: 24 }}>
              <HedgehogAvatar />
              <View style={styles.theirs}>
                <Text style={[Type.body, { color: Theme.ink }]}>{t.text}</Text>
                {t.detail ? <Text style={[Type.subheadline, { color: Theme.secondary }]}>{t.detail}</Text> : null}
              </View>
            </View>
          ),
        )}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: insets.bottom + 6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => setUseHistory((v) => !v)} style={[styles.chip, { backgroundColor: useHistory ? Theme.accentTone.fill : Theme.tertiaryFill }]}>
            <Symbol name={useHistory ? 'checkmark.circle.fill' : 'circle'} size={12} color={useHistory ? Theme.accentTone.ink : Theme.secondary} weight="semibold" />
            <Text style={[Type.caption, { fontWeight: '600', color: useHistory ? Theme.accentTone.ink : Theme.secondary }]}>{friend ? `${firstName(friend)}’s chat history` : 'All your chats'}</Text>
          </Pressable>
          {photo ? (
            <View style={[styles.chip, { backgroundColor: Theme.plansTone.fill, paddingLeft: 4 }]}>
              <Image source={{ uri: photo }} style={{ width: 28, height: 28, borderRadius: 6 }} />
              <Text style={[Type.caption, { fontWeight: '600', color: Theme.ink }]}>1 photo</Text>
              <Pressable onPress={() => setPhoto(undefined)} accessibilityLabel="Remove photo" hitSlop={8}>
                <Symbol name="xmark.circle.fill" size={14} color={Theme.secondary} />
              </Pressable>
            </View>
          ) : null}
        </View>
        {pickError ? <Text style={[Type.caption, { color: Theme.deadline }]}>{pickError}</Text> : null}
        <View style={styles.field}>
          <Pressable onPress={pick} accessibilityLabel="Add a photo" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Symbol name="photo.badge.plus" size={20} color={Theme.accent} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={friend ? `Ask about ${firstName(friend)}…` : 'Ask me anything…'}
            placeholderTextColor={Theme.secondary}
            multiline
            style={[Type.body, { flex: 1, color: Theme.ink, maxHeight: 100, paddingVertical: 8 }]}
          />
          <Pressable onPress={() => send(draft, photo)} disabled={!canSend} accessibilityLabel="Send" style={[styles.send, { opacity: canSend ? 1 : 0.4 }]}>
            <Symbol name="arrow.up" size={14} color="#FFFFFF" weight="bold" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mine: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Theme.accent, borderRadius: 18, borderBottomRightRadius: 4 },
  theirs: { flexShrink: 1, gap: 8, padding: 14, backgroundColor: Theme.panel, borderRadius: 18, borderTopLeftRadius: 4 },
  composer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Theme.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 4, paddingVertical: 4, borderRadius: 26, borderWidth: 1, borderColor: Theme.accent, backgroundColor: Theme.background },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.accent },
});
