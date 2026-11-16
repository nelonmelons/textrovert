import { ComponentRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firstName } from '../../people';
import { turn, Turn, unavailableReply } from '../../chat';
import { ask, type Citation, type Person, type Turn as ApiTurn } from '../../api/client';
import { useDataMode } from '../../api/mode';
import { useFriend } from '../../api/people';
import { openLiveSource } from '../../api/sources';
import { BackButton, Backdrop, Bubble, Chevron, Chip, ContactHeader, DesignFonts, FieldError, fonts, Glass, Icon, IconButton, PillButton, PressScale, radii, space, Stamp, Sticker, sym, TAB_BAR_SPACE, Txt, useDesign } from '@/design';
import { useSheet } from '../../components/Sheet';
import { FadeIn } from '../../components/FadeIn';
import { AnswerText } from './AnswerText';
import { groupByChat, Sources } from './Sources';
import { Receipts } from './Receipts';
import { PeoplePicker } from './PeoplePicker';
import { starters } from './starters';
import { haptics } from '../../lib/haptics';
import { nativeDriver, useReducedMotion } from '../../lib/motion';

const mark = require('../../../assets/art/hedgehog-mark.png');

const greeting = (name?: string) =>
  turn({ fromMe: false, text: name ? `Hi! Ask me anything about your chats with ${name}, or add a photo.` : 'Hi! Ask me anything about your friends, plans or chats, or add a photo.' });

const clock = (at?: number) => (at ? new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : undefined);

/** The last few question and answer turns, as context for a follow-up. */
const historyOf = (turns: Turn[]): ApiTurn[] =>
  turns
    .flatMap((t): ApiTurn[] => (t.fromMe && t.text && !t.image ? [{ role: 'user', content: t.text }] : t.kind === 'answer' ? [{ role: 'assistant', content: t.text }] : []))
    .slice(-6);

/**
 * Ask, answering from /ask when live, drawn as the frontpage hero phone's Messages thread over the moonlit beach: the
 * contact header (Textrovert's avatar over its name), a timestamp line, grey received and blue sent bubbles with tails,
 * a typing bubble while it reads, starters as a house-glass list, and a form-glass composer with a white send key.
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
  const contact = name ? `${name} · Textrovert` : 'Textrovert';
  const firstAt = turns.find((t) => t.at)?.at;

  /** In the tab the composer floats over the tab bar; with the keyboard up it hugs the keyboard. */
  const composerBottom = inTab ? (keyboard ? space.sm : Math.max(TAB_BAR_SPACE - 4, 49 + insets.bottom + 20)) : insets.bottom + space.sm;
  const newChat = <PillButton title="New" small disabled={fresh} accessibilityLabel="New chat" onPress={startOver} />;

  return (
    <DesignFonts>
      <View style={{ flex: 1 }}>
        <Backdrop scene="dusk" scrim={0.18} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.gutter, paddingBottom: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ width: 72 }}>{inTab ? null : <BackButton />}</View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <ContactHeader name={contact} image={mark} onPress={live ? openPicker : undefined} />
              </View>
              <View style={{ width: 72, alignItems: 'flex-end' }}>{newChat}</View>
            </View>
          </View>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: fresh ? 'flex-start' : 'flex-end', paddingHorizontal: 10, paddingTop: space.md, paddingBottom: space.lg, gap: 2 }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={{ marginBottom: 6 }}>
              <Stamp>
                iMessage{'\n'}
                <Text style={{ fontWeight: '600' }}>Today</Text> {clock(firstAt ?? Date.now())}
              </Stamp>
            </View>
            {turns.map((t, i) => {
              const nextSame = turns[i + 1] && !!turns[i + 1].fromMe === !!t.fromMe;
              const gap = i > 0 && !!turns[i - 1].fromMe === !!t.fromMe ? 2 : 8;
              if (t.fromMe)
                return (
                  <FadeIn key={t.id} style={{ marginTop: gap }}>
                    {t.image ? <Image source={{ uri: t.image }} style={{ alignSelf: 'flex-end', width: 180, height: 180, borderRadius: radii.bubble, marginBottom: 2, marginRight: 5 }} accessibilityLabel="Your photo" /> : null}
                    {t.text ? <Bubble mine text={t.text} tail={!nextSame} /> : null}
                  </FadeIn>
                );
              if (t.kind === 'pending')
                return (
                  <FadeIn key={t.id} delay={120} style={{ marginTop: gap, gap: 6 }}>
                    <Bubble>
                      <TypingDots />
                    </Bubble>
                    <Waiting startedAt={t.startedAt ?? Date.now()} name={name} />
                  </FadeIn>
                );
              return (
                <FadeIn key={t.id} style={{ marginTop: gap, gap: 6 }}>
                  <Bubble tail={!nextSame} maxWidth="86%">
                    {t.kind === 'answer' ? (
                      <AnswerText answer={t.text} known={new Set((t.citations ?? []).map((x) => x.n))} onCite={(n) => openReceipts(t.citations ?? [], n)} />
                    ) : t.kind === 'error' ? (
                      <View style={{ gap: 2 }}>
                        <Text style={{ fontFamily: fonts.sf, fontSize: 17, lineHeight: 22, fontWeight: '600', color: '#000000' }}>I couldn’t answer that.</Text>
                        <Text style={{ fontFamily: fonts.sf, fontSize: 15, lineHeight: 20, color: 'rgba(0, 0, 0, 0.6)' }}>{t.text}</Text>
                      </View>
                    ) : (
                      <View style={{ gap: 2 }}>
                        <Text style={{ fontFamily: fonts.sf, fontSize: 17, lineHeight: 22, letterSpacing: -0.43, color: '#000000' }}>{t.text}</Text>
                        {t.detail ? <Text style={{ fontFamily: fonts.sf, fontSize: 15, lineHeight: 20, color: 'rgba(0, 0, 0, 0.6)' }}>{t.detail}</Text> : null}
                      </View>
                    )}
                  </Bubble>
                  {t.kind === 'answer' && t.citations?.length ? (
                    <View style={{ paddingLeft: 10 }}>
                      <Sources citations={t.citations} onOpen={(n) => openReceipts(t.citations ?? [], n)} />
                    </View>
                  ) : null}
                  {t.kind === 'error' ? (
                    <View style={{ paddingLeft: 10 }}>
                      <PillButton title="Try again" small onPress={() => retry(t)} />
                    </View>
                  ) : null}
                </FadeIn>
              );
            })}
            {live && fresh ? (
              <FadeIn delay={160} style={{ marginTop: space.xl, gap: space.sm }}>
                <View style={{ paddingHorizontal: 6 }}>
                  <Sticker text="Try asking" accent="asking" size={18} />
                </View>
                <Glass tone="dark" radius={radii.xl} style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>
                  {starters(person).map((s, i) => (
                    <View key={s.question}>
                      {i ? <View style={{ height: 0.5, backgroundColor: c.separator, marginHorizontal: space.md }} /> : null}
                      <Starter question={s.question} detail={s.detail} onPress={() => send(s.question)} />
                    </View>
                  ))}
                </Glass>
              </FadeIn>
            ) : null}
          </ScrollView>
          <View style={{ gap: space.sm, paddingHorizontal: space.gutter, paddingTop: space.xs, paddingBottom: composerBottom }}>
            {live || photo ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                {live ? (
                  <Chip
                    label={(name ? `${name}’s chats` : 'All your chats') + '  ▾'}
                    accessibilityLabel={(name ? `Asking about ${name}` : 'Asking about all your chats') + '. Change'}
                    onPress={openPicker}
                  />
                ) : null}
                {photo ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 4, paddingRight: 12, borderRadius: radii.pill, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)' }}>
                    <Image source={{ uri: photo }} style={{ width: 26, height: 26, borderRadius: 13 }} />
                    <Txt variant="subhead" style={{ fontWeight: '600', fontSize: 13 }}>
                      1 photo
                    </Txt>
                    <Pressable onPress={() => setPhoto(undefined)} accessibilityLabel="Remove photo" hitSlop={8}>
                      <Icon name="xmark" size={12} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
            {pickError ? <FieldError>{pickError}</FieldError> : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
              <IconButton icon="photo.badge.plus" label="Add a photo" size={46} onPress={pick} />
              <Glass tone="light" radius={23} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 46, paddingLeft: space.lg, paddingRight: 4, paddingVertical: 3 }}>
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
              </Glass>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </DesignFonts>
  );
}

/** A starter question as a FAQ row: the question, what it finds, and a pink chevron. */
function Starter({ question, detail, onPress }: { question: string; detail: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={question + '. ' + detail} scale={0.98}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="body">{question}</Txt>
          <Txt variant="footnote" tone="secondary">
            {detail}
          </Txt>
        </View>
        <Chevron />
      </View>
    </PressScale>
  );
}

/** Send: the frontpage's white key as a circle with a navy arrow; faint until there is something to send. */
function SendButton({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: enabled ? '#FFFFFF' : 'rgba(255, 255, 255, 0.2)', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <Icon name={sym('arrow.up', 'arrow_upward')} size={17} color={enabled ? '#081721' : 'rgba(255, 255, 255, 0.6)'} weight="bold" />
    </Pressable>
  );
}

/** Messages' typing indicator: three dots that brighten in turn. */
function TypingDots() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setTick((n) => (n + 1) % 3), 380);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 7, paddingHorizontal: 2 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === tick ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.22)' }} />
      ))}
    </View>
  );
}

const STATUS_EVERY_MS = 3800;
const LONG_WAIT_S = 28;

/** A status line that changes every few seconds under the scan line, since live answers take 10-40s. */
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
    <Animated.View style={{ opacity: fade, paddingLeft: 17 }}>
      <Txt aria-live="polite" variant="footnote" shadow>
        {line}
      </Txt>
    </Animated.View>
  );
}
