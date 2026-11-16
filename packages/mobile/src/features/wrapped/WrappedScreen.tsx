import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  firstName, quotesFor, rangeCacheKey, rangeLabel,
  type WrappedController, type WrappedDateRange, type WrappedEdition, type WrappedHighlight, type WrappedParticipant,
} from '@textrovert/wrapped';

import { useSheet } from '@/components/Sheet';
import { haptics } from '@/lib/haptics';

import { useWrapped } from './data';
import { SlideContext, useReduced, type HeadingRef, type Story } from './parts';
import {
  BusiestScene, FinaleScene, GhostScene, GuessScene, JokeScene, MessageScene, OpenerScene, PivotScene, TicketScene, TwistScene, WarmScene,
  type MessageAction, type SlideState,
} from './scenes';
import { EditionList, SharePreview, SourcesSheet } from './sheets';
import { fonts, text, worldFor } from './theme';

type Slide =
  | { kind: 'opener'; edition: WrappedEdition }
  | { kind: 'highlight'; highlight: WrappedHighlight }
  | { kind: 'finale'; edition: WrappedEdition }
  | { kind: 'message'; title: string; message: string; actions: MessageAction[] };

const locale = 'en-US';

/**
 * Wrapped for one one-on-one chat, full screen: opener, one slide per highlight, finale. Editions come from the API's
 * POST /wrapped and are cached on the phone. `from`/`through` (YYYY-MM-DD) pick the range; without them it reopens
 * the last range shown, or the server's default.
 */
export function WrappedScreen({ conversationId, from, through }: { conversationId: string; from?: string; through?: string }) {
  const router = useRouter();
  const { state, retry } = useWrapped(conversationId, from, through);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const controller = state.kind === 'ready' ? state.controller : null;
  return (
    <>
      <StatusBar style="light" />
      {controller ? (
        <Story controller={controller} onClose={close} />
      ) : (
        <Pager
          conversationId={conversationId}
          story={null}
          slides={[
            state.kind === 'failed'
              ? { kind: 'message', title: 'I couldn’t open Wrapped', message: state.message, actions: [{ title: 'Try again', id: 'wrappedRetry', primary: true, run: () => void retry() }] }
              : { kind: 'message', title: 'I’m reading your messages…', message: loadingBody, actions: [] },
          ]}
          phaseKey={state.kind}
          onClose={close}
        />
      )}
    </>
  );
}

const loadingBody = 'The model runs on the Textrovert server. I check every quote it points to against your original messages before I show it.';

function Story({ controller, onClose }: { controller: WrappedController; onClose: () => void }) {
  const sheet = useSheet();
  const phase = controller.phase;
  const owner: WrappedParticipant = controller.conversation.participants.find((p) => p.id === controller.ownerID) ?? { id: controller.ownerID, name: 'You' };
  const friend: WrappedParticipant = controller.conversation.participants.find((p) => p.id !== controller.ownerID) ?? { id: 'friend', name: 'Friend' };
  const friendFirst = firstName(friend);
  const story: Story = { owner, friend, service: controller.conversation.service, range: controller.range, locale, world: worldFor(controller.conversation.id) };
  const [states, setStates] = useState<Record<string, SlideState>>({});

  const widen = (range: WrappedDateRange) => {
    setStates({});
    void controller.widen(range);
  };
  const label = (r: WrappedDateRange) => rangeLabel(r, locale);

  const slides: Slide[] = (() => {
    switch (phase.kind) {
      case 'loading':
        return [{ kind: 'message', title: `I’m reading your messages with ${friendFirst}…`, message: loadingBody, actions: [] }];
      case 'failed':
        return [{ kind: 'message', title: 'I couldn’t make this edition', message: phase.message, actions: [
          { title: 'Try again', id: 'wrappedRetry', primary: true, run: () => void controller.generate() },
          ...(controller.editions.length > 0 ? [{ title: 'Back to your last edition', id: 'wrappedBackToEdition', primary: false, run: () => controller.select(controller.editions.length - 1) }] : []),
        ] }];
      case 'edition':
        return [{ kind: 'opener', edition: phase.edition }, ...phase.edition.highlights.map((h) => ({ kind: 'highlight' as const, highlight: h })), { kind: 'finale', edition: phase.edition }];
      case 'exhausted': {
        const actions: MessageAction[] = [];
        if (phase.wider) actions.push({ title: `Try ${label(phase.wider)}`, id: 'wrappedWiden', primary: true, run: () => widen(phase.wider!) });
        if (controller.editions.length > 0) actions.push({ title: 'Back to your last edition', id: 'wrappedBackToEdition', primary: phase.wider === null, run: () => controller.select(controller.editions.length - 1) });
        const tail = phase.wider === null ? 'That’s every message in this chat.' : 'I might find more in a wider range.';
        return [{ kind: 'message', title: 'I’ve shown you everything in this range', message: `I’ve already used all ${phase.seen} messages behind your earlier editions. ${tail}`, actions }];
      }
      case 'empty': {
        const actions: MessageAction[] = phase.wider ? [{ title: `Try ${label(phase.wider)}`, id: 'wrappedWiden', primary: true, run: () => widen(phase.wider!) }] : [];
        const r = phase.reason;
        if (r.kind === 'unsupportedConversation') {
          return [{ kind: 'message', title: 'Wrapped is for one-on-one chats', message: 'I can’t reliably tell who said what in a group chat, so I leave them out.', actions: [] }];
        }
        if (r.kind === 'noMessagesInRange') {
          const note = r.outsideRange > 0 ? `${r.outsideRange} message${r.outsideRange === 1 ? ' sits' : 's sit'} outside this range.` : 'There are no messages yet.';
          return [{ kind: 'message', title: 'Your first memory will go here', message: `I couldn’t find any dated messages with ${friendFirst} in ${label(controller.range)}. ${note}`, actions }];
        }
        const n = r.eligibleMessages;
        return [{ kind: 'message', title: 'Your first memory will go here', message: `I read ${n === 1 ? '1 message' : `${n} messages`} from ${label(controller.range)}, but nothing stood out enough for me to quote without guessing.`, actions }];
      }
    }
  })();

  const phaseKey = phase.kind === 'edition' ? phase.edition.id : `${phase.kind}-${rangeCacheKey(controller.range)}`;

  const reveal = (h: WrappedHighlight) => {
    haptics.select();
    const total = Math.max(quotesFor(h, 'punchline').length, 1);
    for (let step = 1; step <= total; step++) {
      setTimeout(() => setStates((s) => ({ ...s, [h.id]: { ...(s[h.id] ?? { revealed: 0 }), revealed: step } })), (step - 1) * 120);
    }
  };
  const guess = (h: WrappedHighlight, id: string) => {
    haptics.select();
    setStates((s) => ({ ...s, [h.id]: { ...(s[h.id] ?? { revealed: 0 }), guess: id } }));
  };

  const render = (slide: Slide) => {
    switch (slide.kind) {
      case 'opener':
        return <OpenerScene story={story} edition={slide.edition} />;
      case 'finale':
        return (
          <FinaleScene
            edition={slide.edition}
            story={story}
            editionCount={controller.editions.length}
            wider={controller.wider}
            onAnother={() => {
              setStates({});
              void controller.generate();
            }}
            onShare={() => sheet.open({ title: 'Preview', content: <SharePreview edition={slide.edition} owner={owner} friend={friend} locale={locale} onDone={sheet.close} /> })}
            onWiden={widen}
            onEditions={() =>
              sheet.open({
                title: 'Earlier editions',
                content: <EditionList editions={controller.editions} current={controller.editions.findIndex((e) => e.id === slide.edition.id)} onSelect={(i) => { sheet.close(); setStates({}); controller.select(i); }} />,
              })
            }
          />
        );
      case 'message':
        return <MessageScene title={slide.title} message={slide.message} story={story} friend={friendFirst} actions={slide.actions} />;
      case 'highlight': {
        const h = slide.highlight;
        const st = states[h.id] ?? { revealed: 0 };
        const props = { h, story, state: st, onReveal: () => reveal(h) };
        switch (h.signal) {
          case 'quotableLine':
            return <GuessScene h={h} story={story} state={st} onGuess={(id) => guess(h, id)} />;
          case 'runningJoke':
            return <JokeScene {...props} />;
          case 'datedInvitation':
            return <TicketScene {...props} />;
          case 'lastLineTwist':
            return <TwistScene {...props} />;
          case 'topicChange':
            return <PivotScene {...props} />;
          case 'replyGaps':
            return <GhostScene {...props} />;
          case 'busiestDay':
            return <BusiestScene {...props} />;
          case 'warmMoment':
            return <WarmScene {...props} />;
        }
      }
    }
  };

  const sourcesFor = (slide: Slide | undefined) => {
    if (slide?.kind !== 'highlight') return null;
    const st = states[slide.highlight.id];
    const done = slide.highlight.signal === 'quotableLine' ? st?.guess !== undefined : (st?.revealed ?? 0) > 0;
    return done ? slide.highlight : null;
  };

  return (
    <Pager
      conversationId={controller.conversation.id}
      story={story}
      slides={slides}
      phaseKey={phaseKey}
      onClose={onClose}
      render={render}
      sources={(slide) => {
        const h = sourcesFor(slide);
        return h ? () => sheet.open({ title: 'Sources', content: <SourcesSheet highlight={h} story={story} /> }) : null;
      }}
    />
  );
}

/** The chrome (progress, Close, Back, Sources, Next) and one slide at a time; swipes page too, but never only them. */
function Pager({ conversationId, story, slides, phaseKey, onClose, render, sources }: {
  conversationId: string; story: Story | null; slides: Slide[]; phaseKey: string; onClose: () => void;
  render?: (slide: Slide) => React.ReactNode; sources?: (slide: Slide | undefined) => (() => void) | null;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReduced();
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const heading: HeadingRef = useRef(null);
  const world = story?.world ?? worldFor(conversationId);
  const fallbackStory: Story = story ?? {
    owner: { id: 'owner', name: 'You' }, friend: { id: 'friend', name: 'Friend' }, service: '', locale,
    range: { start: 0, end: 86_400_000, timeZone: 'UTC' }, world,
  };

  useEffect(() => setPage(0), [phaseKey]);
  const current = Math.min(page, slides.length - 1);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const timer = setTimeout(() => {
      const node = heading.current ? findNodeHandle(heading.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 400);
    return () => clearTimeout(timer);
  }, [current, phaseKey]);

  const go = (delta: number) => {
    const target = Math.min(Math.max(current + delta, 0), slides.length - 1);
    if (target === current) return;
    setDirection(delta);
    setPage(target);
  };
  const goRef = useRef(go);
  goRef.current = go;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -40) goRef.current(1);
          else if (g.dx > 40) goRef.current(-1);
        },
      }),
    [],
  );

  const slide = slides[current];
  const openSources = sources?.(slide) ?? null;
  const entering = reduced ? FadeIn.duration(100) : direction > 0 ? SlideInRight.duration(260) : SlideInLeft.duration(260);
  const exiting = reduced ? FadeOut.duration(100) : direction > 0 ? SlideOutLeft.duration(260) : SlideOutRight.duration(260);

  return (
    <View style={{ flex: 1, backgroundColor: world.deep, overflow: 'hidden' }} {...pan.panHandlers}>
      <Animated.View key={`${phaseKey}-${current}`} entering={entering} exiting={exiting} style={StyleSheet.absoluteFill}>
        <SlideContext.Provider value={{ active: true, heading }}>
          {slide ? (render ? render(slide) : slide.kind === 'message' ? <MessageScene title={slide.title} message={slide.message} story={fallbackStory} friend={null} actions={slide.actions} /> : null) : null}
        </SlideContext.Provider>
      </Animated.View>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View accessible accessibilityLabel={`Slide ${current + 1} of ${Math.max(slides.length, 1)}`} testID="wrappedProgress" style={styles.progress}>
          {slides.map((_, i) => <Segment key={i} filled={i <= current} reduced={reduced} />)}
        </View>
        <Pressable testID="wrappedClose" accessibilityRole="button" accessibilityLabel="Close Wrapped" onPress={onClose} style={styles.close}>
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor="#FFFFFF" size={18} weight="heavy" />
        </Pressable>
      </View>

      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.55)']} style={[styles.shade, { height: 150 + insets.bottom }]} />
        <NavButton label="Back" testID="wrappedBack" symbol={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} enabled={current > 0} onPress={() => go(-1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          {openSources ? (
            <Pressable testID="wrappedSources" accessibilityRole="button" accessibilityLabel="Sources" onPress={() => { haptics.select(); openSources(); }} style={styles.sources}>
              <SymbolView name={{ ios: 'text.quote', android: 'format_quote', web: 'format_quote' }} tintColor="#FFFFFF" size={16} />
              <Text style={{ ...text.subheadline, fontFamily: fonts.rounded, fontWeight: '800', color: '#FFFFFF' }}>Sources</Text>
            </Pressable>
          ) : null}
        </View>
        <NavButton label="Next" testID="wrappedNext" symbol={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} enabled={current < slides.length - 1} onPress={() => go(1)} />
      </View>
    </View>
  );
}

function Segment({ filled, reduced }: { filled: boolean; reduced: boolean }) {
  const style = useAnimatedStyle(() => ({ width: withTiming(filled ? '100%' : '0%', { duration: reduced ? 0 : 300 }) }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' }, style]} />
    </View>
  );
}

function NavButton({ label, testID, symbol, enabled, onPress }: { label: string; testID: string; symbol: Parameters<typeof SymbolView>[0]['name']; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={onPress} style={[styles.nav, { opacity: enabled ? 1 : 0.35 }]}>
      <SymbolView name={symbol} tintColor="#FFFFFF" size={22} weight="heavy" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.4)', overflow: 'hidden' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  nav: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  sources: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)' },
});

