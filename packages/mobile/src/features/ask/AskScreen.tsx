import { useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { AssistantTurn, MyBubble } from '@/components/Bubbles';
import { Chip } from '@/components/Chip';
import { Composer } from '@/components/Composer';
import { Face } from '@/components/Face';
import { FadeIn } from '@/components/FadeIn';
import { HedgehogAvatar } from '@/components/HedgehogAvatar';
import { PaperScreen } from '@/components/PaperScreen';
import { useSheet } from '@/components/Sheet';
import { TypingDots } from '@/components/TypingDots';
import { ask, type Citation, type Person, type Turn as ApiTurn } from '@/lib/api';
import { firstName } from '@/lib/answer';
import { haptics } from '@/lib/haptics';
import { nativeDriver, useReducedMotion } from '@/lib/motion';
import { brand, radius, shadow, type, useTheme } from '@/theme';
import { AnswerText } from './AnswerText';
import { PeoplePicker } from './PeoplePicker';
import { Receipts } from './Receipts';
import { setAskScope, useAskScope } from './scope';
import { Sources } from './Sources';
import { starters } from './starters';

type Turn =
  | { id: number; kind: 'question'; text: string }
  | { id: number; kind: 'pending'; question: string; startedAt: number }
  | { id: number; kind: 'answer'; answer: string; citations: Citation[] }
  | { id: number; kind: 'error'; question: string; message: string };

let nextId = 1;

/** Ask: a chat with the assistant over your own messages, for everyone or scoped to one friend. */
export function AskScreen() {
  const theme = useTheme();
  const sheet = useSheet();
  const scope = useAskScope();
  const [threads, setThreads] = useState<Record<string, Turn[]>>({});
  const key = scope?.name ?? '';
  const turns = threads[key] ?? [];
  const busy = turns.some((t) => t.kind === 'pending');
  const scroll = useRef<ScrollViewInstance>(null);
  const name = scope ? firstName(scope.name) : null;

  const update = (thread: string, fn: (turns: Turn[]) => Turn[]) => setThreads((all) => ({ ...all, [thread]: fn(all[thread] ?? []) }));

  const run = async (question: string, thread: string, person: string | null, history: ApiTurn[]) => {
    const pendingId = nextId++;
    update(thread, (ts) => [...ts, { id: pendingId, kind: 'pending', question, startedAt: Date.now() }]);
    let next: Turn;
    try {
      const result = await ask(question, person, history);
      next = { id: pendingId, kind: 'answer', answer: result.answer, citations: result.citations };
    } catch (error) {
      next = { id: pendingId, kind: 'error', question, message: error instanceof Error ? error.message : String(error) };
    }
    update(thread, (ts) => ts.map((t) => (t.id === pendingId ? next : t)));
  };

  const historyOf = (ts: Turn[]): ApiTurn[] =>
    ts.flatMap((t): ApiTurn[] => (t.kind === 'question' ? [{ role: 'user', content: t.text }] : t.kind === 'answer' ? [{ role: 'assistant', content: t.answer }] : [])).slice(-6);

  const send = (question: string) => {
    if (busy) return;
    haptics.send();
    const history = historyOf(turns);
    update(key, (ts) => [...ts, { id: nextId++, kind: 'question', text: question }]);
    void run(question, key, scope?.name ?? null, history);
  };

  const retry = (turn: Extract<Turn, { kind: 'error' }>) => {
    const before = turns.slice(0, turns.indexOf(turn));
    update(key, (ts) => ts.filter((t) => t.id !== turn.id));
    void run(turn.question, key, scope?.name ?? null, historyOf(before.slice(0, -1)));
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
          current={scope?.name ?? null}
          onPick={(p: Person | null) => {
            haptics.select();
            setAskScope(p);
            sheet.close();
          }}
        />
      ),
    });

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [turns.length, turns[turns.length - 1]?.kind, key]);

  const groups = scope ? scope.chats - (scope.dm ? 1 : 0) : 0;
  return (
    <PaperScreen
      title={name ? 'Ask about ' + name : 'Ask'}
      subtitle={scope ? (scope.dm ? 'Your DM' : 'No DM') + ' + ' + groups + ' shared ' + (groups === 1 ? 'group' : 'groups') : 'All your chats'}
      avatar={scope ? <Face name={scope.name} size={26} tone={theme.ask} /> : <HedgehogAvatar size={30} tone={theme.ask} />}
      onPressTitle={openPicker}
      titleLabel={(name ? 'Asking about ' + name : 'Asking about all your chats') + '. Change'}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={[styles.thread, turns.length === 0 ? styles.emptyThread : null]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled">
          {turns.length === 0 ? <Empty key={key} person={scope} onAsk={send} /> : null}
          {turns.map((t) => {
            if (t.kind === 'question')
              return (
                <FadeIn key={t.id}>
                  <MyBubble text={t.text} tone={theme.ask} />
                </FadeIn>
              );
            if (t.kind === 'pending')
              return (
                <FadeIn key={t.id} delay={120}>
                  <Pending startedAt={t.startedAt} name={name} />
                </FadeIn>
              );
            if (t.kind === 'error')
              return (
                <FadeIn key={t.id}>
                  <AssistantTurn tone={theme.ask}>
                    <Text style={[type.headline, { color: brand.deadline }]}>I couldn't answer that.</Text>
                    <Text style={[type.subheadline, { color: theme.secondary }]}>{t.message}</Text>
                    <Pressable accessibilityRole="button" onPress={() => retry(t)} style={[styles.retry, { backgroundColor: theme.ask.fill }]}>
                      <Text style={[type.subheadline, { color: theme.ask.ink, fontWeight: '600' }]}>Try again</Text>
                    </Pressable>
                  </AssistantTurn>
                </FadeIn>
              );
            return (
              <FadeIn key={'a' + t.id}>
                <AssistantTurn tone={theme.ask}>
                  <AnswerText
                    answer={t.answer || "I couldn't find anything about that in your chats."}
                    known={new Set(t.citations.map((c) => c.n))}
                    onCite={(n) => openReceipts(t.citations, n)}
                  />
                  {t.citations.length > 0 ? (
                    <Sources citations={t.citations} onOpen={(n) => openReceipts(t.citations, n)} />
                  ) : (
                    <Text style={[type.caption, { color: theme.secondary }]}>No messages cited for this one.</Text>
                  )}
                </AssistantTurn>
              </FadeIn>
            );
          })}
        </ScrollView>
        <Composer
          tone={theme.ask}
          disabled={busy}
          placeholder={name ? `Ask about ${name}…` : 'Ask about your friends…'}
          onSend={send}
          accessory={
            <>
              <Chip tone={theme.ask} leading="✓" label={scope ? `${name}'s chats` : 'All your chats'} onRemove={scope ? () => setAskScope(null) : undefined} />
              <Chip tone={theme.ask} selected={false} leading="+" label={scope ? 'Change friend' : 'Ask about a friend'} onPress={openPicker} />
            </>
          }
        />
      </KeyboardAvoidingView>
    </PaperScreen>
  );
}

/** The empty chat: the reading hedgehog, a line about what Ask does, and four starter questions. */
function Empty({ person, onAsk }: { person: Person | null; onAsk: (q: string) => void }) {
  const theme = useTheme();
  const name = person ? firstName(person.name) : null;
  return (
    <View style={styles.empty}>
      <FadeIn style={styles.hero}>
        <View style={[styles.art, { backgroundColor: theme.ask.fill }]}>
          <Image source={require('../../../assets/hedgehog-reader.png')} resizeMode="contain" style={styles.artImage} aria-hidden />
        </View>
        <Text accessibilityRole="header" style={[type.title2, styles.center, { color: theme.ink }]}>
          {name ? `What do you want to know about ${name}?` : "What's on your mind?"}
        </Text>
        <Text style={[type.subheadline, styles.center, { color: theme.secondary }]}>
          {name ? `I'll read your DM and the groups you share, and show the receipts.` : 'I read your chats so you can remember what matters, and I show the receipts.'}
        </Text>
      </FadeIn>
      <View style={styles.grid}>
        {starters(person?.name ?? null).map((s, i) => (
          <FadeIn key={s.question} delay={120 + i * 60} style={styles.cell}>
            <Pressable
              accessibilityRole="button"
              aria-label={'Ask: ' + s.question}
              onPress={() => onAsk(s.question)}
              style={({ pressed }) => [styles.starter, shadow.soft, { backgroundColor: pressed ? theme.ask.fill : theme.panel, borderColor: theme.gridMajor, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
              <Text style={styles.emoji}>{s.emoji}</Text>
              <Text style={[type.subheadline, { color: theme.ink, fontWeight: '600' }]}>{s.question}</Text>
              <Text style={[type.caption, { color: theme.secondary }]}>{s.detail}</Text>
            </Pressable>
          </FadeIn>
        ))}
      </View>
    </View>
  );
}

const STATUS_EVERY_MS = 3800;
const LONG_WAIT_S = 28;

/** Typing dots with a status line that changes every few seconds, since answers take 10-40s. */
function Pending({ startedAt, name }: { startedAt: number; name: string | null }) {
  const theme = useTheme();
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
    <AssistantTurn tone={theme.ask}>
      <View style={styles.pending}>
        <TypingDots color={theme.ask.ink} />
        <Animated.Text aria-live="polite" style={[type.footnote, styles.fill, { color: theme.secondary, opacity: fade }]}>
          {line}
        </Animated.Text>
      </View>
    </AssistantTurn>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  thread: { padding: 16, gap: 14 },
  emptyThread: { flexGrow: 1, justifyContent: 'center' },
  empty: { gap: 22, paddingVertical: 8 },
  hero: { alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  art: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  artImage: { width: 104, height: 114, marginTop: 6 },
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48%', flexGrow: 1 },
  starter: { flex: 1, gap: 4, padding: 12, borderRadius: radius.tile, borderWidth: StyleSheet.hairlineWidth, minHeight: 112 },
  emoji: { fontSize: 20, lineHeight: 26 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.capsule },
});
