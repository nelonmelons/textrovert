import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Friend, firstName } from '../../fixtures';
import { reply, subjectOf, turn, Turn } from '../../chat';
import { ask, type Citation, type Person, type Turn as ApiTurn } from '../../api/client';
import { useDataMode } from '../../api/mode';
import { useFriend, useFriends } from '../../api/people';
import { Rounded, Theme, Type, withAlpha } from '../../theme';
import { GridPaper, HedgehogAvatar, Symbol } from '../../components/Paper';
import { useSheet } from '../../components/Sheet';
import { TypingDots } from '../../components/TypingDots';
import { FadeIn } from '../../components/FadeIn';
import { AnswerText } from './AnswerText';
import { Sources } from './Sources';
import { Receipts } from './Receipts';
import { PeoplePicker } from './PeoplePicker';
import { starters } from './starters';
import { haptics } from '../../lib/haptics';
import { nativeDriver, useReducedMotion } from '../../lib/motion';

const greeting = (name?: string) =>
  turn({ fromMe: false, text: name ? `Hi! Ask me anything about your chats with ${name}, or add a photo.` : 'Hi! Ask me anything about your friends, plans or chats, or add a photo.' });

/** The last few question and answer turns, as context for a follow-up. */
const historyOf = (turns: Turn[]): ApiTurn[] =>
  turns
    .flatMap((t): ApiTurn[] => (t.fromMe && t.text && !t.image ? [{ role: 'user', content: t.text }] : t.kind === 'answer' ? [{ role: 'assistant', content: t.text }] : []))
    .slice(-6);

/** Emma's chat, answering from /ask when live. In the Ask tab it draws its own title; pushed as /chat, the stack header does. */
export function ChatScreen({ inTab = false }: { inTab?: boolean }) {
  const params = useLocalSearchParams<{ friend?: string; q?: string }>();
  const { live } = useDataMode();
  const { friend } = useFriend(params.friend || undefined);
  const { friends } = useFriends();
  const sheet = useSheet();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const scopeKey = params.friend ?? '';
  /** Who /ask is scoped to: the friend's name when live (their route id), else everyone. */
  const person = live && params.friend ? params.friend : null;
  const name = friend ? firstName(friend) : person ? person.split(/\s+/)[0] : undefined;
  const [threads, setThreads] = useState<Record<string, Turn[]>>({});
  const turns = threads[scopeKey] ?? [greeting(name)];
  const [draft, setDraft] = useState('');
  const [useHistory, setUseHistory] = useState(true);
  const [photo, setPhoto] = useState<string>();
  const [pending, setPending] = useState<{ question: string; image: string; subject: Friend }>();
  const [pickError, setPickError] = useState<string>();
  const started = useRef(false);
  const busy = turns.some((t) => t.kind === 'pending');

  const update = (key: string, fn: (turns: Turn[]) => Turn[]) => setThreads((all) => ({ ...all, [key]: fn(all[key] ?? [greeting(name)]) }));

  const askLive = async (question: string, key: string, scope: string | null, history: ApiTurn[]) => {
    const waiting = turn({ fromMe: false, kind: 'pending', text: '', question, startedAt: Date.now() });
    update(key, (t) => [...t, waiting]);
    let next: Turn;
    try {
      const result = await ask(question, scope, history);
      next = { ...waiting, kind: 'answer', text: result.answer || 'I couldn’t find anything about that in your chats.', citations: result.citations };
    } catch (error) {
      next = { ...waiting, kind: 'error', text: error instanceof Error ? error.message : String(error) };
    }
    update(key, (t) => t.map((x) => (x.id === waiting.id ? next : x)));
  };

  const send = (raw: string, image?: string) => {
    const question = raw.trim();
    if ((!question && !image) || busy) return;
    haptics.send();
    const mine = turn({ fromMe: true, text: question, image });
    setDraft('');
    setPhoto(undefined);
    if (live && !image) {
      const history = historyOf(turns);
      update(scopeKey, (t) => [...t, mine]);
      void askLive(question, scopeKey, person, history);
      return;
    }
    const next = [mine];
    const subject = subjectOf(question, friend, friends);
    if (image && useHistory && subject) {
      setPending({ question, image, subject });
      next.push(turn({ fromMe: false, kind: 'clarify', about: firstName(subject), text: `Should I look at just your photo, or your photo and your chats with ${firstName(subject)} together?` }));
    } else {
      next.push(reply(question, { friend, image, includeHistory: !image && useHistory, subject }));
    }
    update(scopeKey, (t) => [...t, ...next]);
  };

  const retry = (failed: Turn) => {
    const before = turns.slice(0, turns.indexOf(failed));
    update(scopeKey, (t) => t.filter((x) => x.id !== failed.id));
    void askLive(failed.question ?? '', scopeKey, person, historyOf(before.slice(0, -1)));
  };

  const answerPending = (includeHistory: boolean) => {
    if (!pending) return;
    setPending(undefined);
    update(scopeKey, (t) => [
      ...t,
      turn({ fromMe: true, text: includeHistory ? `Photo + chats with ${firstName(pending.subject)}` : 'Just the photo' }),
      reply(pending.question, { friend, image: pending.image, includeHistory, subject: pending.subject }),
    ]);
  };

  useEffect(() => {
    if (started.current || !params.q) return;
    started.current = true;
    send(params.q);
  }, [params.q]);

  const pick = async () => {
    setPickError(undefined);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled) setPhoto(result.assets[0].uri);
    } catch {
      setPickError('That photo couldn’t be loaded. Try another one.');
    }
  };

  const openReceipts = (citations: Citation[], focus?: number) => {
    haptics.select();
    sheet.open({ title: citations.length === 1 ? 'Source' : citations.length + ' sources', content: <Receipts citations={citations} focus={focus} /> });
  };

  const openPicker = () =>
    sheet.open({
      title: 'Ask about',
      content: (
        <PeoplePicker
          current={person}
          onPick={(p: Person | null) => {
            haptics.select();
            router.setParams({ friend: p?.name ?? '' });
            sheet.close();
          }}
        />
      ),
    });

  const canSend = (draft.trim().length > 0 || !!photo) && !busy;
  const fresh = turns.length === 1;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Theme.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={inTab ? 0 : 100}>
      {inTab ? (
        <View style={[styles.tabTitle, { paddingTop: insets.top + 12 }]}>
          <HedgehogAvatar />
          <Text style={[Type.title2, { flex: 1, color: Theme.ink, fontFamily: Rounded.bold }]}>{name ? `Ask about ${name}` : 'Ask me'}</Text>
        </View>
      ) : (
        <Stack.Screen options={{ headerTitle: name ? `Ask about ${name}` : 'Ask me', headerTitleStyle: { color: Theme.ink, fontWeight: '600' } }} />
      )}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <GridPaper width={440} height={1400} />
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 14 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {turns.map((t) =>
          t.fromMe ? (
            <FadeIn key={t.id} style={{ alignItems: 'flex-end', gap: 6, paddingLeft: 48 }}>
              {t.image ? <Image source={{ uri: t.image }} style={{ width: 140, height: 140, borderRadius: 16 }} accessibilityLabel="Your photo" /> : null}
              {t.text ? (
                <View style={styles.mine}>
                  <Text style={[Type.body, { color: '#FFFFFF' }]}>{t.text}</Text>
                </View>
              ) : null}
            </FadeIn>
          ) : (
            <FadeIn key={t.id} delay={t.kind === 'pending' ? 120 : 0} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingRight: t.kind === 'answer' ? 0 : 24 }}>
              <HedgehogAvatar />
              <View style={[styles.theirs, t.kind === 'answer' && { flex: 1 }]}>
                {t.kind === 'pending' ? (
                  <Waiting startedAt={t.startedAt ?? Date.now()} name={name} />
                ) : t.kind === 'answer' ? (
                  <>
                    <AnswerText answer={t.text} known={new Set((t.citations ?? []).map((c) => c.n))} onCite={(n) => openReceipts(t.citations ?? [], n)} />
                    {t.citations?.length ? (
                      <Sources citations={t.citations} onOpen={(n) => openReceipts(t.citations ?? [], n)} />
                    ) : (
                      <Text style={[Type.caption, { color: Theme.secondary }]}>No messages cited for this one.</Text>
                    )}
                  </>
                ) : t.kind === 'error' ? (
                  <>
                    <Text style={[Type.headline, { color: Theme.deadline }]}>I couldn’t answer that.</Text>
                    <Text style={[Type.subheadline, { color: Theme.secondary }]}>{t.text}</Text>
                    <Pressable accessibilityRole="button" onPress={() => retry(t)} style={styles.choice}>
                      <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Try again</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={[Type.body, { color: Theme.ink }]}>{t.text}</Text>
                    {t.detail ? <Text style={[Type.subheadline, { color: Theme.secondary }]}>{t.detail}</Text> : null}
                  </>
                )}
                {t.kind === 'analysis' ? (
                  <Pressable onPress={() => router.push('/analysis')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Symbol name="text.bubble" size={14} color={Theme.accent} weight="semibold" />
                    <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>See why I think that</Text>
                  </Pressable>
                ) : null}
                {t.kind === 'clarify' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, opacity: pending ? 1 : 0.4 }}>
                    <Pressable disabled={!pending} onPress={() => answerPending(false)} style={styles.choice}>
                      <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Just the photo</Text>
                    </Pressable>
                    <Pressable disabled={!pending} onPress={() => answerPending(true)} style={styles.choice}>
                      <Text style={[Type.subheadline, { color: Theme.accent, fontWeight: '600' }]}>Photo + chats with {t.about}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </FadeIn>
          ),
        )}
        {live && fresh
          ? starters(person).map((s, i) => (
              <FadeIn key={s.question} delay={120 + i * 60}>
                <Pressable onPress={() => send(s.question)} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.75 }]}>
                  <Text style={{ fontSize: 17 }}>{s.emoji}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[Type.subheadline, { color: Theme.ink, fontWeight: '500' }]}>{s.question}</Text>
                    <Text style={[Type.caption, { color: Theme.secondary }]}>{s.detail}</Text>
                  </View>
                </Pressable>
              </FadeIn>
            ))
          : null}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: inTab ? 10 : insets.bottom + 6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {live ? (
            <Pressable onPress={openPicker} accessibilityLabel={(name ? `Asking about ${name}` : 'Asking about all your chats') + '. Change'} style={[styles.chip, { backgroundColor: Theme.accentTone.fill }]}>
              <Symbol name="checkmark.circle.fill" size={12} color={Theme.accentTone.ink} weight="semibold" />
              <Text style={[Type.caption, { fontWeight: '600', color: Theme.accentTone.ink }]}>{name ? `${name}’s chats` : 'All your chats'}</Text>
              <Symbol name="chevron.down" size={10} color={Theme.accentTone.ink} weight="bold" />
            </Pressable>
          ) : (
            <Pressable onPress={() => setUseHistory((v) => !v)} style={[styles.chip, { backgroundColor: useHistory ? Theme.accentTone.fill : Theme.tertiaryFill }]}>
              <Symbol name={useHistory ? 'checkmark.circle.fill' : 'circle'} size={12} color={useHistory ? Theme.accentTone.ink : Theme.secondary} weight="semibold" />
              <Text style={[Type.caption, { fontWeight: '600', color: useHistory ? Theme.accentTone.ink : Theme.secondary }]}>{friend ? `${firstName(friend)}’s chat history` : 'All your chats'}</Text>
            </Pressable>
          )}
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
            placeholder={name ? `Ask about ${name}…` : 'Ask me anything…'}
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

const STATUS_EVERY_MS = 3800;
const LONG_WAIT_S = 28;

/** Typing dots with a status line that changes every few seconds, since live answers take 10-40s. */
function Waiting({ startedAt, name }: { startedAt: number; name?: string }) {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(Date.now());
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const lines = [name ? `Reading your chats with ${name}…` : 'Reading your chats…', 'Finding the right messages…', 'Checking the receipts…', 'Lining up the quotes…', 'Putting it into words…', 'Almost there…'];
  const elapsed = now - startedAt;
  const line = elapsed / 1000 >= LONG_WAIT_S ? 'Still digging. Big questions can take up to 40 seconds.' : lines[Math.min(Math.floor(elapsed / STATUS_EVERY_MS), lines.length - 1)];
  useEffect(() => {
    if (reduced) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: nativeDriver }).start();
  }, [line, fade, reduced]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <TypingDots color={Theme.accent} />
      <Animated.Text aria-live="polite" style={[Type.footnote, { flexShrink: 1, color: Theme.secondary, opacity: fade }]}>
        {line}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 8, backgroundColor: Theme.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Theme.gridMajor },
  mine: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Theme.accent, borderRadius: 18, borderBottomRightRadius: 4 },
  theirs: { flexShrink: 1, gap: 8, padding: 14, backgroundColor: Theme.panel, borderRadius: 18, borderTopLeftRadius: 4 },
  choice: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: withAlpha(Theme.accentTone.fill, 0.8) },
  suggestion: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, marginLeft: 44, borderRadius: 14, borderWidth: 1, borderColor: withAlpha(Theme.accent, 0.5), backgroundColor: withAlpha(Theme.panel, 0.9) },
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
