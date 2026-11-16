import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firstName } from '../../people';
import { turn, Turn, unavailableReply } from '../../chat';
import { ask, type Citation, type Person, type Turn as ApiTurn } from '../../api/client';
import { useDataMode } from '../../api/mode';
import { useFriend } from '../../api/people';
import { openLiveSource } from '../../api/sources';
import { ChatBubble, ChatPanel, Chip, DesignFonts, EmojiAvatar, geist, Header, PillButton, radii, ScanHighlight, Sheet, space, Txt, useDesign } from '@/design';
import { askHedgehog } from './hedgehog';
import { FadeIn } from '../../components/FadeIn';
import { AnswerText } from './AnswerText';
import { groupByChat, Sources } from './Sources';
import { Receipts } from './Receipts';
import { PeoplePicker } from './PeoplePicker';
import { starters } from './starters';
import { haptics } from '../../lib/haptics';
import { nativeDriver, useReducedMotion } from '../../lib/motion';

const greeting = (name?: string) =>
  turn({ fromMe: false, text: name ? `Hi! Ask me anything about your chats with ${name}, or add a photo.` : 'Hi! Ask me anything about your friends, plans or chats, or add a photo.' });

const clock = (at?: number) => (at ? new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : undefined);

/** The last few question and answer turns, as context for a follow-up. */
const historyOf = (turns: Turn[]): ApiTurn[] =>
  turns
    .flatMap((t): ApiTurn[] => (t.fromMe && t.text && !t.image ? [{ role: 'user', content: t.text }] : t.kind === 'answer' ? [{ role: 'assistant', content: t.text }] : []))
    .slice(-6);

type SheetState = { kind: 'receipts'; citations: Citation[]; focus?: number } | { kind: 'picker' };

/** Ask, answering from /ask when live. In the Ask tab it draws its own header; pushed as /chat, the stack header does. */
export function ChatScreen({ inTab = false }: { inTab?: boolean }) {
  const params = useLocalSearchParams<{ friend?: string; q?: string; image?: string }>();
  const { live } = useDataMode();
  const { friend } = useFriend(params.friend || undefined);
  const { c } = useDesign();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const scopeKey = params.friend ?? '';
  /** Who /ask is scoped to: the friend's name when live (their route id), else everyone. */
  const person = live && params.friend ? params.friend : null;
  const name = friend ? firstName(friend) : person ? person.split(/\s+/)[0] : undefined;
  const [threads, setThreads] = useState<Record<string, Turn[]>>({});
  const turns = threads[scopeKey] ?? [greeting(name)];
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [pickError, setPickError] = useState<string>();
  const [sheet, setSheet] = useState<SheetState>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const started = useRef(false);
  const busy = turns.some((t) => t.kind === 'pending');

  const update = (key: string, fn: (turns: Turn[]) => Turn[]) => setThreads((all) => ({ ...all, [key]: fn(all[key] ?? [greeting(name)]) }));

  const askLive = async (question: string, key: string, scope: string | null, history: ApiTurn[]) => {
    const waiting = turn({ fromMe: false, kind: 'pending', text: '', question, startedAt: Date.now() });
    update(key, (t) => [...t, waiting]);
    let next: Turn;
    try {
      const result = await ask(question, scope, history);
      next = { ...waiting, at: Date.now(), kind: 'answer', text: result.answer || 'I couldn’t find anything about that in your chats.', citations: result.citations };
    } catch (error) {
      next = { ...waiting, at: Date.now(), kind: 'error', text: error instanceof Error ? error.message : String(error) };
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
    update(scopeKey, (t) => [...t, mine, unavailableReply(image)]);
  };

  const retry = (failed: Turn) => {
    const before = turns.slice(0, turns.indexOf(failed));
    update(scopeKey, (t) => t.filter((x) => x.id !== failed.id));
    void askLive(failed.question ?? '', scopeKey, person, historyOf(before.slice(0, -1)));
  };

  const startOver = () => {
    haptics.select();
    setThreads((all) => ({ ...all, [scopeKey]: [greeting(name)] }));
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

  const openSheet = (next: SheetState) => {
    haptics.select();
    setSheet(next);
    setSheetOpen(true);
  };

  const canSend = (draft.trim().length > 0 || !!photo) && !busy;
  const fresh = turns.length === 1;
  const title = name ? `Ask about ${name}` : 'Ask';
  const receipts = sheet?.kind === 'receipts' ? sheet.citations : [];
  const receiptChats = groupByChat(receipts).length;

  return (
    <DesignFonts>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={inTab ? 0 : 100}>
        {inTab ? (
          <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.gutter, paddingBottom: space.sm }}>
            <Header
              leading={<EmojiAvatar {...askHedgehog} size={40} />}
              title={title}
              trailing={<PillButton title="New" emoji="✏️" kind="secondary" small disabled={fresh} accessibilityLabel="New chat" onPress={startOver} />}
            />
          </View>
        ) : (
          <Stack.Screen
            options={{
              headerTitle: title,
              headerStyle: { backgroundColor: c.background },
              headerTintColor: c.accentText,
              headerTitleStyle: { color: c.text, fontFamily: geist['600'] },
              headerRight: () => <EmojiAvatar {...askHedgehog} size={32} />,
            }}
          />
        )}
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: space.lg, gap: space.lg }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ChatPanel style={{ gap: space.md }}>
            {turns.map((t) =>
              t.fromMe ? (
                <FadeIn key={t.id}>
                  <ChatBubble mine text={t.text || undefined} time={clock(t.at)}>
                    {t.image ? <Image source={{ uri: t.image }} style={{ width: 160, height: 160, borderRadius: radii.md, marginTop: 6 }} accessibilityLabel="Your photo" /> : null}
                  </ChatBubble>
                </FadeIn>
              ) : t.kind === 'pending' ? (
                <FadeIn key={t.id} delay={120}>
                  <ScanHighlight avatar={askHedgehog} rest={0.5}>
                    <View style={{ paddingVertical: space.sm }}>
                      <ChatBubble name="Textrovert">
                        <Waiting startedAt={t.startedAt ?? Date.now()} name={name} />
                      </ChatBubble>
                    </View>
                  </ScanHighlight>
                </FadeIn>
              ) : (
                <FadeIn key={t.id}>
                  <ChatBubble name="Textrovert" time={clock(t.at)}>
                    {t.kind === 'answer' ? (
                      <>
                        <AnswerText answer={t.text} known={new Set((t.citations ?? []).map((x) => x.n))} onCite={(n) => openSheet({ kind: 'receipts', citations: t.citations ?? [], focus: n })} />
                        {t.citations?.length ? (
                          <Sources citations={t.citations} onOpen={(n) => openSheet({ kind: 'receipts', citations: t.citations ?? [], focus: n })} />
                        ) : (
                          <Txt variant="footnote" color={c.bubbleTime} style={{ marginTop: space.xs }}>
                            No messages cited for this one.
                          </Txt>
                        )}
                      </>
                    ) : t.kind === 'error' ? (
                      <View style={{ gap: space.xs, alignItems: 'flex-start' }}>
                        <Txt variant="headline" color={c.danger}>
                          I couldn’t answer that.
                        </Txt>
                        <Txt variant="subhead" tone="secondary">
                          {t.text}
                        </Txt>
                        <View style={{ marginTop: space.xs }}>
                          <PillButton title="Try again" emoji="🔁" kind="secondary" small onPress={() => retry(t)} />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Txt variant="callout" color={c.bubbleText}>
                          {t.text}
                        </Txt>
                        {t.detail ? (
                          <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
                            {t.detail}
                          </Txt>
                        ) : null}
                      </>
                    )}
                  </ChatBubble>
                </FadeIn>
              ),
            )}
          </ChatPanel>
          {live && fresh ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {starters(person).map((s, i) => (
                <FadeIn key={s.question} delay={120 + i * 60}>
                  <Chip label={s.question} emoji={s.emoji} accessibilityLabel={s.question + '. ' + s.detail} onPress={() => send(s.question)} />
                </FadeIn>
              ))}
            </View>
          ) : null}
        </ScrollView>
        <View style={{ gap: space.sm, paddingHorizontal: space.gutter, paddingTop: space.xs, paddingBottom: inTab ? space.md : insets.bottom + space.sm }}>
          {live || photo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              {live ? (
                <Chip
                  emoji={name ? '💬' : '👯'}
                  label={(name ? `${name}’s chats` : 'All your chats') + '  ▾'}
                  tint={name ? 'mint' : 'lilac'}
                  accessibilityLabel={(name ? `Asking about ${name}` : 'Asking about all your chats') + '. Change'}
                  onPress={() => openSheet({ kind: 'picker' })}
                />
              ) : null}
              {photo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 3, paddingRight: 10, borderRadius: radii.pill, backgroundColor: c.fill }}>
                  <Image source={{ uri: photo }} style={{ width: 26, height: 26, borderRadius: 13 }} />
                  <Txt variant="subhead" style={{ fontWeight: '600', fontSize: 14 }}>
                    1 photo
                  </Txt>
                  <Pressable onPress={() => setPhoto(undefined)} accessibilityLabel="Remove photo" hitSlop={8}>
                    <Txt variant="subhead" tone="secondary" style={{ fontWeight: '700', fontSize: 13 }}>
                      ✕
                    </Txt>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
          {pickError ? (
            <Txt variant="footnote" color={c.danger}>
              {pickError}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52, paddingLeft: space.xs, paddingRight: 6, paddingVertical: 4, borderRadius: 26, backgroundColor: c.fill }}>
            <Pressable onPress={pick} accessibilityLabel="Add a photo" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Txt style={{ fontSize: 20 }}>📷</Txt>
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={name ? `Ask about ${name}…` : 'Ask about your people…'}
              placeholderTextColor={c.textTertiary}
              multiline
              numberOfLines={Platform.OS === 'web' ? 1 : undefined}
              onSubmitEditing={() => send(draft, photo)}
              style={[{ flex: 1, alignSelf: 'center', maxHeight: 100, paddingVertical: 8, fontFamily: geist['400'], fontSize: 17, lineHeight: 22, color: c.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            <PillButton title="Ask" emoji="↑" small disabled={!canSend} accessibilityLabel="Send" onPress={() => send(draft, photo)} />
          </View>
        </View>
        <Sheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          emoji={sheet?.kind === 'picker' ? '🔎' : '🧾'}
          title={sheet?.kind === 'picker' ? 'Ask about' : 'Receipts'}
          subtitle={
            sheet?.kind === 'picker'
              ? 'Everyone, or one friend’s chats'
              : `${receipts.length} ${receipts.length === 1 ? 'message' : 'messages'} from ${receiptChats} ${receiptChats === 1 ? 'chat' : 'chats'}`
          }>
          {sheet?.kind === 'picker' ? (
            <PeoplePicker
              current={person}
              onPick={(p: Person | null) => {
                haptics.select();
                router.setParams({ friend: p?.name ?? '' });
                setSheetOpen(false);
              }}
            />
          ) : sheet?.kind === 'receipts' ? (
            <Receipts
              citations={sheet.citations}
              focus={sheet.focus}
              onOpenChat={(source) => {
                setSheetOpen(false);
                openLiveSource(source, source.quote);
              }}
            />
          ) : null}
        </Sheet>
      </KeyboardAvoidingView>
    </DesignFonts>
  );
}

const STATUS_EVERY_MS = 3800;
const LONG_WAIT_S = 28;

/** A status line that changes every few seconds under the scan line, since live answers take 10-40s. */
function Waiting({ startedAt, name }: { startedAt: number; name?: string }) {
  const reduced = useReducedMotion();
  const { c } = useDesign();
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
    <Animated.View style={{ opacity: fade, minWidth: 210, paddingVertical: space.sm }}>
      <Txt aria-live="polite" variant="callout" color={c.bubbleText}>
        {line}
      </Txt>
    </Animated.View>
  );
}
