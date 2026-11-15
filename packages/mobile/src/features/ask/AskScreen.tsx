import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { AssistantTurn, MyBubble } from '@/components/Bubbles';
import { Chip } from '@/components/Chip';
import { Composer } from '@/components/Composer';
import { PaperScreen } from '@/components/PaperScreen';
import { useSheet } from '@/components/Sheet';
import { TypingDots } from '@/components/TypingDots';
import { ask, senderLabel, type Citation, type Person, type Turn as ApiTurn } from '@/lib/api';
import { firstName } from '@/lib/answer';
import { brand, radius, type, useTheme } from '@/theme';
import { AnswerText } from './AnswerText';
import { PeoplePicker } from './PeoplePicker';
import { Receipts } from './Receipts';
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
  const [scope, setScope] = useState<Person | null>(null);
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
    const history = historyOf(turns);
    update(key, (ts) => [...ts, { id: nextId++, kind: 'question', text: question }]);
    void run(question, key, scope?.name ?? null, history);
  };

  const retry = (turn: Extract<Turn, { kind: 'error' }>) => {
    const before = turns.slice(0, turns.indexOf(turn));
    update(key, (ts) => ts.filter((t) => t.id !== turn.id));
    void run(turn.question, key, scope?.name ?? null, historyOf(before.slice(0, -1)));
  };

  const openReceipts = (citations: Citation[], focus?: number) =>
    sheet.open({ title: citations.length === 1 ? 'Source' : 'Sources', content: <Receipts citations={citations} focus={focus} /> });

  const openPicker = () =>
    sheet.open({
      title: 'Ask about',
      content: (
        <PeoplePicker
          current={scope?.name ?? null}
          onPick={(p) => {
            setScope(p);
            sheet.close();
          }}
        />
      ),
    });

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [turns, key]);

  return (
    <PaperScreen title={name ? 'Ask about ' + name : 'Ask'} subtitle={scope ? 'Your DM and ' + (scope.chats - (scope.dm ? 1 : 0)) + ' shared groups' : 'All your chats'}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.thread} keyboardDismissMode="interactive">
          <AssistantTurn tone={theme.ask}>
            <Text style={[type.body, { color: theme.ink }]}>
              {name ? `Hi! Ask me anything about your chats with ${name}.` : 'Hi! Ask me anything about your friends, plans or chats.'}
            </Text>
            <Text style={[type.footnote, { color: theme.secondary }]}>I answer from your own messages and show where each answer came from.</Text>
          </AssistantTurn>
          {turns.length === 0 ? (
            <View style={styles.starters}>
              <Text style={[type.caption, styles.label, { color: theme.secondary }]}>TRY ASKING</Text>
              {starters(scope?.name ?? null).map((s) => (
                <Pressable
                  key={s.question}
                  accessibilityRole="button"
                  aria-label={'Ask: ' + s.question}
                  onPress={() => send(s.question)}
                  style={({ pressed }) => [styles.starter, { borderColor: theme.ask.ink, backgroundColor: pressed ? theme.ask.fill : theme.panel }]}>
                  <Text style={[type.headline, { color: theme.ask.ink }]}>“</Text>
                  <View style={styles.fill}>
                    <Text style={[type.subheadline, { color: theme.ink, fontWeight: '500' }]}>{s.question}</Text>
                    <Text style={[type.caption, { color: theme.secondary }]}>{s.detail}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {turns.map((t) => {
            if (t.kind === 'question') return <MyBubble key={t.id} text={t.text} tone={theme.ask} />;
            if (t.kind === 'pending') return <Pending key={t.id} startedAt={t.startedAt} name={name} />;
            if (t.kind === 'error')
              return (
                <AssistantTurn key={t.id} tone={theme.ask}>
                  <Text style={[type.headline, { color: brand.deadline }]}>I couldn't answer that.</Text>
                  <Text style={[type.subheadline, { color: theme.secondary }]}>{t.message}</Text>
                  <Pressable accessibilityRole="button" onPress={() => retry(t)} style={[styles.retry, { backgroundColor: theme.ask.fill }]}>
                    <Text style={[type.subheadline, { color: theme.ask.ink, fontWeight: '600' }]}>Try again</Text>
                  </Pressable>
                </AssistantTurn>
              );
            return (
              <AssistantTurn key={t.id} tone={theme.ask}>
                <AnswerText answer={t.answer || "I couldn't find anything about that in your chats."} citations={t.citations} onCite={(n) => openReceipts(t.citations, n)} />
                {t.citations.length > 0 ? (
                  <View style={styles.sources}>
                    <Pressable accessibilityRole="button" onPress={() => openReceipts(t.citations)}>
                      <Text style={[type.caption, styles.label, { color: theme.secondary }]}>
                        {t.citations.length} {t.citations.length === 1 ? 'SOURCE' : 'SOURCES'} · SEE ALL
                      </Text>
                    </Pressable>
                    <View style={styles.chips}>
                      {t.citations.map((c) => (
                        <Chip
                          key={c.n}
                          tone={theme.ask}
                          leading={String(c.n)}
                          label={firstName(senderLabel(c)) + ' · ' + c.chat}
                          onPress={() => openReceipts(t.citations, c.n)}
                          accessibilityLabel={'Source ' + c.n + ': ' + senderLabel(c) + ' in ' + c.chat}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={[type.caption, { color: theme.secondary }]}>No messages cited for this one.</Text>
                )}
              </AssistantTurn>
            );
          })}
        </ScrollView>
        <Composer
          tone={theme.ask}
          disabled={busy}
          placeholder={name ? `Ask about ${name}…` : 'Ask me anything…'}
          onSend={send}
          accessory={
            <>
              <Chip tone={theme.ask} leading="✓" label={scope ? `${name}'s chats` : 'All your chats'} onRemove={scope ? () => setScope(null) : undefined} />
              <Chip tone={theme.ask} selected={false} leading="+" label={scope ? 'Change friend' : 'Ask about a friend'} onPress={openPicker} />
            </>
          }
        />
      </KeyboardAvoidingView>
    </PaperScreen>
  );
}

function Pending({ startedAt, name }: { startedAt: number; name: string | null }) {
  const theme = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  return (
    <AssistantTurn tone={theme.ask}>
      <TypingDots color={theme.ask.ink} />
      <Text style={[type.footnote, { color: theme.secondary }]}>
        {seconds < 8 ? (name ? `Reading your chats with ${name}…` : 'Reading your chats…') : 'Still digging. Answers can take up to half a minute.'}
      </Text>
    </AssistantTurn>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  thread: { padding: 16, gap: 14 },
  starters: { gap: 8, paddingLeft: 44 },
  label: { fontWeight: '700', letterSpacing: 0.6 },
  starter: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: radius.tile, borderWidth: 1 },
  sources: { gap: 6, paddingTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.capsule },
});
