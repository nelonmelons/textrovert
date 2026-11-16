import { ComponentRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firstName } from '../../people';
import { turn, Turn, unavailableReply } from '../../chat';
import { ask, type Citation, type Person, type Turn as ApiTurn } from '../../api/client';
import { useDataMode } from '../../api/mode';
import { useFriend } from '../../api/people';
import { openLiveSource } from '../../api/sources';
import { Backdrop, ChatBubble, Chip, DesignFonts, fonts, Glass, Icon, PillButton, PressScale, radii, ScanHighlight, space, sym, TAB_BAR_SPACE, TopBar, Txt, useDesign } from '@/design';
import { useSheet } from '../../components/Sheet';
import { AskAvatar } from './AskAvatar';
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

/**
 * Ask, answering from /ask when live, on Ditto's dusk photograph. In the Ask tab it draws a Spencer title over the sky
 * and its composer clears the floating tab bar; pushed as /chat, it draws a glass top bar and sits on the safe area.
 */
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
  const sheet = useSheet();
  const started = useRef(false);
  const [keyboard, setKeyboard] = useState(false);
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

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const pick = async () => {
    setPickError(undefined);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled) setPhoto(result.assets[0].uri);
    } catch {
      setPickError('That photo couldn’t be loaded. Try another one.');
    }
  };

  /** Receipts and the scope picker open in the root sheet, which floats over the tab bar. */
  const openReceipts = (citations: Citation[], focus?: number) => {
    haptics.select();
    const chats = groupByChat(citations).length;
    sheet.open({
      emoji: '🧾',
      title: 'Receipts',
      subtitle: `${citations.length} ${citations.length === 1 ? 'message' : 'messages'} from ${chats} ${chats === 1 ? 'chat' : 'chats'}`,
      content: (
        <Receipts
          citations={citations}
          focus={focus}
          onOpenChat={(source) => {
            sheet.close();
            openLiveSource(source, source.quote);
          }}
        />
      ),
    });
  };

  const openPicker = () => {
    haptics.select();
    sheet.open({
      emoji: '🔎',
      title: 'Ask about',
      subtitle: 'Everyone, or one friend’s chats',
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
  };

  const canSend = (draft.trim().length > 0 || !!photo) && !busy;
  const fresh = turns.length === 1;
  const title = name ? `Ask about ${name}` : 'Ask';

  /** In the tab the composer floats over the transparent tab bar; with the keyboard up (iOS hides nothing) it hugs it. */
  const composerBottom = inTab ? (keyboard ? space.sm : Math.max(TAB_BAR_SPACE - 12, 49 + insets.bottom + 12)) : insets.bottom + space.sm;
  const newChat = <PillButton title="New" icon={<Icon name={sym('square.and.pencil', 'edit_square')} size={14} />} small disabled={fresh} accessibilityLabel="New chat" onPress={startOver} />;

  return (
    <DesignFonts>
      <View style={{ flex: 1 }}>
        <Backdrop scene="dusk" scrim={0.2} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {inTab ? (
            <View style={{ paddingTop: insets.top + space.xl, paddingHorizontal: space.gutter, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, paddingLeft: space.xs }}>
                <Txt accessibilityRole="header" variant={name ? 'title1' : 'largeTitle'} numberOfLines={1}>
                  {title}
                </Txt>
              </View>
              {newChat}
            </View>
          ) : null}
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: inTab ? space.md : insets.top + 76, paddingBottom: space.lg, gap: space.md }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {fresh ? (
              <Hero name={name} greeting={turns[0].text} />
            ) : (
              turns.map((t) =>
                t.fromMe ? (
                  <FadeIn key={t.id}>
                    <ChatBubble mine text={t.text || undefined} time={clock(t.at)}>
                      {t.image ? <Image source={{ uri: t.image }} style={{ width: 180, height: 180, borderRadius: radii.md, marginTop: 6 }} accessibilityLabel="Your photo" /> : null}
                    </ChatBubble>
                  </FadeIn>
                ) : t.kind === 'pending' ? (
                  <FadeIn key={t.id} delay={120}>
                    <ScanHighlight avatar={askHedgehog} rest={0.5}>
                      <Theirs>
                        <ChatBubble>
                          <Waiting startedAt={t.startedAt ?? Date.now()} name={name} />
                        </ChatBubble>
                      </Theirs>
                    </ScanHighlight>
                  </FadeIn>
                ) : (
                  <FadeIn key={t.id}>
                    <Theirs>
                      <ChatBubble time={clock(t.at)}>
                        {t.kind === 'answer' ? (
                          <>
                            <AnswerText answer={t.text} known={new Set((t.citations ?? []).map((x) => x.n))} onCite={(n) => openReceipts(t.citations ?? [], n)} />
                            {t.citations?.length ? (
                              <Sources citations={t.citations} onOpen={(n) => openReceipts(t.citations ?? [], n)} />
                            ) : (
                              <Txt variant="footnote" color={c.bubbleTime} style={{ marginTop: space.xs }}>
                                No messages cited for this one.
                              </Txt>
                            )}
                          </>
                        ) : t.kind === 'error' ? (
                          <View style={{ gap: space.xs, alignItems: 'flex-start', paddingVertical: 2 }}>
                            <Txt variant="headline" color={c.danger}>
                              I couldn’t answer that.
                            </Txt>
                            <Txt variant="subhead" tone="secondary">
                              {t.text}
                            </Txt>
                            <View style={{ marginTop: space.xs }}>
                              <PillButton title="Try again" icon={<Icon name={sym('arrow.clockwise', 'refresh')} size={14} />} small onPress={() => retry(t)} />
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
                    </Theirs>
                  </FadeIn>
                ),
              )
            )}
            {live && fresh ? (
              <View style={{ gap: space.sm }}>
                {starters(person).map((s, i) => (
                  <FadeIn key={s.question} delay={120 + i * 60}>
                    <Starter emoji={s.emoji} question={s.question} detail={s.detail} onPress={() => send(s.question)} />
                  </FadeIn>
                ))}
              </View>
            ) : null}
          </ScrollView>
          <View style={{ gap: space.sm, paddingHorizontal: space.gutter, paddingTop: space.xs, paddingBottom: composerBottom }}>
            {live || photo ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                {live ? (
                  <Chip
                    emoji={name ? '💬' : '✨'}
                    label={(name ? `${name}’s chats` : 'All your chats') + '  ▾'}
                    accessibilityLabel={(name ? `Asking about ${name}` : 'Asking about all your chats') + '. Change'}
                    onPress={openPicker}
                  />
                ) : null}
                {photo ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 4, paddingRight: 12, borderRadius: radii.pill, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.28)' }}>
                    <Image source={{ uri: photo }} style={{ width: 26, height: 26, borderRadius: 13 }} />
                    <Txt variant="subhead" style={{ fontWeight: '700', fontSize: 13 }}>
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
              <Txt variant="footnote" color={c.danger} shadow>
                {pickError}
              </Txt>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
              <PressScale onPress={pick} accessibilityLabel="Add a photo" scale={0.92}>
                <Glass tone="light" radius={24} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={sym('photo.on.rectangle', 'add_photo_alternate')} size={20} />
                </Glass>
              </PressScale>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  minHeight: 48,
                  paddingLeft: space.lg,
                  paddingRight: 4,
                  paddingVertical: 4,
                  borderRadius: 24,
                  backgroundColor: c.input,
                  borderWidth: 0.5,
                  borderColor: 'rgba(255, 255, 255, 0.16)',
                  boxShadow: '0px 8px 24px rgba(4, 12, 18, 0.18)',
                }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={name ? `Ask about ${name}…` : 'Ask about your people…'}
                  placeholderTextColor={c.placeholder}
                  multiline
                  numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                  onSubmitEditing={() => send(draft, photo)}
                  onKeyPress={(e) => {
                    const key = e.nativeEvent as { key: string; shiftKey?: boolean };
                    if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey) {
                      e.preventDefault?.();
                      send(draft, photo);
                    }
                  }}
                  style={[{ flex: 1, alignSelf: 'center', maxHeight: 110, paddingVertical: 9, fontFamily: fonts.ui, fontSize: 16, lineHeight: 21, color: c.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
                />
                <SendButton enabled={canSend} onPress={() => send(draft, photo)} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
        {!inTab ? (
          <>
            <LinearGradient pointerEvents="none" colors={['rgba(8, 23, 33, 0.78)', 'rgba(8, 23, 33, 0.5)', 'rgba(8, 23, 33, 0)']} locations={[0, 0.6, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 96 }} />
            <TopBar title={name ? `Ask about ${name}` : 'Ask'} trailing={newChat} />
          </>
        ) : null}
      </View>
    </DesignFonts>
  );
}

/** An assistant turn: the pink hedgehog avatar beside its bubble, iMessage-style, so the bubble needs no name. */
function Theirs({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
      <AskAvatar size={28} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** The empty chat: the avatar glowing over the sky, a Spencer prompt and the greeting. */
function Hero({ name, greeting }: { name?: string; greeting: string }) {
  return (
    <FadeIn style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl, paddingBottom: space.lg, paddingHorizontal: space.lg }}>
      <AskAvatar size={72} glow />
      <Txt variant="title1" style={{ textAlign: 'center', marginTop: space.sm }}>
        {name ? `What about ${name}?` : 'Ask your chats anything'}
      </Txt>
      <Txt variant="callout" tone="secondary" shadow style={{ textAlign: 'center', maxWidth: 300 }}>
        {greeting}
      </Txt>
    </FadeIn>
  );
}

/** A starter question as a white-glass row: emoji, the question, and what it finds. */
function Starter({ emoji, question, detail, onPress }: { emoji: string; question: string; detail: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={question + '. ' + detail} scale={0.98}>
      <Glass tone="light" radius={radii.lg} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.16)' }}>
          <Txt style={{ fontSize: 17, lineHeight: 22 }}>{emoji}</Txt>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="subhead" style={{ fontWeight: '700', fontSize: 15 }}>
            {question}
          </Txt>
          <Txt variant="footnote" tone="secondary">
            {detail}
          </Txt>
        </View>
        <Txt variant="title3" tone="tertiary" style={{ fontWeight: '400' }}>
          ›
        </Txt>
      </Glass>
    </PressScale>
  );
}

/** Ditto's hot action: a pink circle with a white arrow; glass and dim until there is something to send. */
function SendButton({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  const { c, shadow } = useDesign();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: enabled ? c.accent : 'rgba(255, 255, 255, 0.1)',
        boxShadow: enabled ? shadow.glow : undefined,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}>
      <Icon name={sym('arrow.up', 'arrow_upward')} size={18} color={enabled ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'} weight="bold" />
    </Pressable>
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
