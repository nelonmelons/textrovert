import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInRight, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';

import {
  formatElapsed, quotesFor, rangeDayCount, rangeLabel,
  type WrappedDateRange, type WrappedEdition, type WrappedHighlight,
} from '@textrovert/wrapped';

import {
  Bubble, DisplayText, Enter, Eyebrow, Footnote, Glow, GradientText, RainbowRing, Scroll, Stars, TapPill, WideButton,
  attribution, dayLabel, friendName, ghostPath, isOwner, slantedHalf, tangentPath, ticketPath, useReduced, useRepeat, useSlide, useTween, who,
  type Story,
} from './parts';
import { fonts, lift, palette, rainbowText, text, withAlpha } from './theme';

export interface SlideState {
  guess?: string;
  revealed: number;
}

interface SceneProps {
  h: WrappedHighlight;
  story: Story;
  state: SlideState;
  onReveal: () => void;
}

const fill = StyleSheet.absoluteFill;
const answeredSeconds = (h: WrappedHighlight) => (h.figure.kind === 'answeredIn' ? h.figure.seconds : 0);

function Why({ h, color, order }: { h: WrappedHighlight; color: string; order?: number }) {
  if (!h.why) return null;
  return order === undefined ? <Footnote color={color}>{h.why}</Footnote> : <Enter order={order}><Footnote color={color}>{h.why}</Footnote></Enter>;
}

/** A colour wash over the slide's Ditto photograph: translucent, so the sky still shows through. */
function Gradient({ colors, start = { x: 0.5, y: 0 }, end = { x: 0.5, y: 1 }, opacity = 0.42 }: { colors: string[]; start?: { x: number; y: number }; end?: { x: number; y: number }; opacity?: number }) {
  return <LinearGradient colors={colors as [string, string, ...string[]]} start={start} end={end} style={[fill, { opacity }]} />;
}

/** Marks a non-text element as the slide's heading, for focus after paging. */
function Heading({ label, children }: { label?: string; children: ReactNode }) {
  const slide = useSlide();
  return (
    <View ref={slide.heading ?? undefined} accessibilityRole="header" accessible={label !== undefined} accessibilityLabel={label}>
      {children}
    </View>
  );
}

// Opener

export function OpenerScene({ story, edition }: { story: Story; edition: WrappedEdition }) {
  const w = story.world;
  const slide = useSlide();
  const name = friendName(story);
  return (
    <View style={fill}>
      <Gradient colors={[w.deep, withAlpha(w.mid, 0.8), w.deep]} />
      <Glow colors={[w.mid, withAlpha(w.hot, 0.7), withAlpha(w.glow, 0.4)]} active={slide.active} />
      <View pointerEvents="none" aria-hidden style={[fill, { overflow: 'hidden' }]}>
        <View style={{ position: 'absolute', right: -170, bottom: -250, opacity: 0.55 }}>
          <RainbowRing size={520} stroke={18} active={slide.active} />
        </View>
      </View>
      <Scroll>
        <View style={{ gap: 18 }}>
          <Enter order={0}>
            <Eyebrow text={edition.number > 1 ? `Wrapped · edition ${edition.number}` : 'Wrapped'} color={w.glow} />
          </Enter>
          <Enter order={1} distance={44}>
            <Heading label={`Wrapped, you and ${name}`}>
              <Text style={{ fontFamily: fonts.serif, fontSize: 48, lineHeight: 50, fontWeight: '400', color: palette.butter, ...lift }}>You &</Text>
              <GradientText lines={[name]} colors={rainbowText} size={104} family={fonts.serif} weight="400" lineHeight={1.02} widthPerChar={0.42} label={name} />
            </Heading>
          </Enter>
          <Enter order={2}>
            <Text style={{ ...text.title2, fontFamily: fonts.rounded, fontWeight: '700', color: w.glow }}>{rangeLabel(story.range, story.locale)}</Text>
          </Enter>
          <Enter order={3}>
            <Text style={{ ...text.body, fontWeight: '500', color: withAlpha(palette.butter, 0.9) }}>
              {edition.isShortRecap
                ? `I only found ${edition.analyzedMessageCount} messages in this range, so this one’s short.`
                : `I read ${edition.analyzedMessageCount} of your ${story.service} messages with ${name}. I only kept moments I could trace back to the original texts.`}
            </Text>
          </Enter>
          <Enter order={4}>
            <Text style={{ ...text.subheadline, fontFamily: fonts.rounded, fontWeight: '700', color: palette.butter, marginTop: 8, ...lift }}>Swipe or tap Next  →</Text>
          </Enter>
        </View>
      </Scroll>
    </View>
  );
}

// Who said it

export function GuessScene({ h, story, state, onGuess }: Omit<SceneProps, 'onReveal'> & { onGuess: (id: string) => void }) {
  const w = story.world;
  const slide = useSlide();
  const reduced = useReduced();
  const setup = quotesFor(h, 'setup')[0];
  const answer = quotesFor(h, 'reveal')[0];
  const guessed = state.guess !== undefined;
  const speakerColor = isOwner(story, setup) ? w.hot : w.glow;
  const [height, setHeight] = useState(0);
  const wipe = useSharedValue(guessed ? 1 : 0);
  useEffect(() => {
    wipe.value = reduced ? (guessed ? 1 : 0) : withTiming(guessed ? 1 : 0, { duration: 550, easing: Easing.inOut(Easing.ease) });
  }, [guessed, reduced, wipe]);
  const panel = useAnimatedStyle(() => ({ height: `${wipe.value * 100}%`, opacity: wipe.value > 0 ? 1 : 0 }));
  return (
    <View style={fill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <View style={[fill, { backgroundColor: w.deep, opacity: 0.4 }]} />
      <Glow colors={[w.mid, withAlpha(w.hot, 0.45)]} active={slide.active && !guessed} />
      <Scroll bottom={guessed ? 124 : 300}>
        <View style={{ gap: 22 }}>
          <Enter order={0}><Eyebrow text={h.headline} color={w.glow} /></Enter>
          <Enter order={1} distance={40}><DisplayText text={`“${setup.text}”`} color={palette.butter} heading /></Enter>
        </View>
      </Scroll>
      {!guessed ? (
        <View style={styles.guessDock} pointerEvents="box-none">
          <Enter order={2}>
            <Text style={{ ...text.title3, fontFamily: fonts.rounded, fontWeight: '700', color: w.glow, paddingHorizontal: 24 }}>{h.prompt}</Text>
          </Enter>
          <Enter order={3} distance={60}>
            <SplitButtons story={story} onGuess={onGuess} />
          </Enter>
        </View>
      ) : null}
      <Animated.View
        pointerEvents={guessed ? 'auto' : 'none'}
        accessibilityElementsHidden={!guessed}
        importantForAccessibility={guessed ? 'auto' : 'no-hide-descendants'}
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: 'rgba(1, 30, 44, 0.94)', borderTopWidth: 1, borderTopColor: 'rgba(83, 105, 121, 1)' }, panel]}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height || '100%' }}>
          <Scroll>
            <View style={{ gap: 18 }}>
              <Enter active={guessed} order={1}><Eyebrow text={state.guess === setup.speakerID ? 'You called it' : 'It was'} /></Enter>
              <Enter active={guessed} order={2} distance={50}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontFamily: fonts.compressed, fontWeight: '400', fontSize: Math.max(60, Math.min(120, 560 / Math.max([...who(story, setup)].length, 1))), color: '#FFFFFF', textTransform: 'uppercase', ...lift }}>
                  {who(story, setup)}
                </Text>
              </Enter>
              <Enter active={guessed} order={3}>
                <Text style={{ ...text.title3, fontFamily: fonts.serif, fontWeight: '400', color: '#FFFFFF' }}>“{setup.text}”</Text>
                <Text style={{ ...text.caption, fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)', marginTop: 18 }}>{attribution(story, setup)}</Text>
              </Enter>
              <View style={{ height: 0.5, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginVertical: 6 }} />
              <Enter active={guessed} order={5}>
                <Eyebrow text={`${who(story, answer)}, ${formatElapsed(answeredSeconds(h))} later`} />
              </Enter>
              <Enter active={guessed} order={6} distance={34}>
                <Bubble quote={answer} story={story} fill={palette.ink} color={palette.butter} caption={withAlpha(palette.ink, 0.75)} />
              </Enter>
            </View>
          </Scroll>
        </View>
      </Animated.View>
    </View>
  );
}

/** Me or them: the frontpage's button pair, the white pill with navy ink and the glass pill with white. */
function SplitButtons({ story, onGuess }: { story: Story; onGuess: (id: string) => void }) {
  const people = [
    { p: story.owner, primary: true },
    { p: story.friend, primary: false },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 96 }}>
      {people.map(({ p, primary }) => {
        const name = p.name.split(' ').find((s) => s) ?? p.name;
        return (
          <Pressable
            key={p.id}
            testID={`wrappedGuess-${p.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Guess ${name}`}
            onPress={() => onGuess(p.id)}
            style={({ pressed }) => [
              { flex: 1, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, transform: [{ scale: pressed ? 0.97 : 1 }] },
              primary
                ? { backgroundColor: '#FFFFFF' }
                : { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.8)', borderLeftColor: 'rgba(255, 255, 255, 0.45)', borderRightColor: 'rgba(255, 255, 255, 0.14)', borderBottomColor: 'rgba(255, 255, 255, 0.3)', boxShadow: 'inset 0px 1px 4px 0px rgba(255, 255, 255, 0.25)' },
            ]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontFamily: fonts.serif, fontWeight: '400', fontSize: 30, color: primary ? '#081721' : '#FFFFFF' }}>
              {name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Running joke

function Timeline({ dates, range, color, track, progress }: { dates: number[]; range: WrappedDateRange; color: string; track: string; progress: number }) {
  const [width, setWidth] = useState(0);
  const height = 112, y = height * 0.68, inset = 16;
  const span = range.end - range.start;
  const days = Math.max(rangeDayCount(range), 1);
  const usable = Math.max(width - inset * 2, 0);
  const axisEnd = inset + usable * Math.min(progress * 2, 1);
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={inset} y1={y} x2={axisEnd} y2={y} stroke={track} strokeWidth={3} strokeLinecap="round" />
          {Array.from({ length: days + 1 }, (_, d) => {
            const x = inset + (usable * d) / days;
            return x <= axisEnd ? <Line key={d} x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={track} strokeWidth={1.5} /> : null;
          })}
          {dates.map((date, i) => {
            const appear = Math.min(Math.max(progress * (dates.length + 1) - i - 0.6, 0), 1);
            if (appear <= 0) return null;
            const x = inset + usable * ((date - range.start) / span);
            const r = 11 * appear, top = y - 34 * appear;
            return (
              <G key={i}>
                <Line x1={x} y1={y} x2={x} y2={top} stroke={color} strokeWidth={2} />
                <Circle cx={x} cy={top} r={r} fill={color} />
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

export function JokeScene({ h, story, state, onReveal }: SceneProps) {
  const w = story.world;
  const slide = useSlide();
  const reduced = useReduced();
  const first = quotesFor(h, 'setup')[0];
  const last = quotesFor(h, 'punchline')[0];
  const dates = h.figure.kind === 'occurrences' ? h.figure.dates : [];
  const days = Math.floor((last.sentAt - first.sentAt) / 86_400_000);
  const progress = useTween(slide.active ? 1 : 0, 1400, 350);
  return (
    <View style={fill}>
      <Gradient colors={[w.mid, w.deep]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} />
      <Glow colors={[withAlpha(w.hot, 0.7), withAlpha(w.glow, 0.4)]} active={slide.active} />
      <Scroll>
        <View style={{ gap: 20 }}>
          <Enter order={0}><Eyebrow text="Running joke" color={w.glow} /></Enter>
          <Enter order={1} distance={40}><DisplayText text={h.headline} type="poster" color={palette.butter} heading /></Enter>
          <Enter order={2}>
            <View accessible accessibilityLabel={`Timeline: ${h.quantity?.value ?? ''} uses, ${h.quantity?.detail ?? ''}`} style={{ gap: 4 }}>
              <Timeline dates={dates} range={story.range} color={w.hot} track={withAlpha(w.glow, 0.55)} progress={progress} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ ...text.caption2, fontWeight: '600', color: withAlpha(w.glow, 0.8) }}>{dayLabel(story, story.range.start)}</Text>
                <Text style={{ ...text.caption2, fontWeight: '600', color: withAlpha(w.glow, 0.8) }}>{dayLabel(story, story.range.end - 1000)}</Text>
              </View>
            </View>
          </Enter>
          <Enter order={3} style={{ gap: 20 }}>
            <Eyebrow text="First time" color={w.glow} />
            <Bubble quote={first} story={story} fill={w.glow} color={palette.ink} caption={withAlpha(w.glow, 0.85)} />
          </Enter>
          {state.revealed === 0 ? (
            <Enter order={4}><TapPill title="Show the latest callback" color={w.hot} ink={palette.ink} testID="wrappedReveal" onPress={onReveal} /></Enter>
          ) : (
            <Animated.View entering={reduced ? FadeIn.duration(100) : ZoomIn.springify().damping(14)} style={{ gap: 20, transformOrigin: 'right bottom' }}>
              <Eyebrow text={`Latest · ${days} days later`} color={w.glow} />
              <Bubble quote={last} story={story} fill={w.hot} color={palette.ink} caption={withAlpha(w.glow, 0.85)} />
            </Animated.View>
          )}
          <Why h={h} color={withAlpha(w.glow, 0.9)} order={5} />
        </View>
      </Scroll>
    </View>
  );
}

// Plan ticket

function Stamp({ seconds, story }: { seconds: number; story: Story }) {
  const w = story.world;
  const reduced = useReduced();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withSpring(1, { duration: 500, dampingRatio: 0.65 });
  }, [reduced, p]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(p.value * 1.5, 1), transform: [{ rotate: '-12deg' }, { scale: 2.2 - 1.2 * p.value }] }));
  return (
    <Animated.View aria-hidden style={[{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 10 }, style]}>
      <Text style={{ fontFamily: fonts.rounded, fontSize: 11, lineHeight: 13, fontWeight: '900', letterSpacing: 0.8, textAlign: 'center', color: '#081721' }}>
        {'ANSWERED IN\n' + formatElapsed(seconds).toUpperCase()}
      </Text>
    </Animated.View>
  );
}

export function TicketScene({ h, story, state, onReveal }: SceneProps) {
  const w = story.world;
  const slide = useSlide();
  const reduced = useReduced();
  const invite = quotesFor(h, 'setup')[0];
  const reply = quotesFor(h, 'punchline')[0];
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={fill}>
      <View style={[fill, { backgroundColor: w.deep, opacity: 0.35 }]} />
      <Glow colors={[withAlpha(w.hot, 0.8), withAlpha(w.mid, 0.25)]} active={slide.active} />
      <Scroll>
        <View style={{ gap: 22 }}>
          <Enter order={0}><Eyebrow text="A plan, on the record" color={withAlpha(palette.ink, 0.7)} /></Enter>
          <Enter order={1} distance={50}>
            <View style={{ flexDirection: 'row', transform: [{ rotate: reduced ? '0deg' : '-2.5deg' }] }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
              {box ? (
                <Svg width={box.w} height={box.h} style={fill} aria-hidden>
                  <Path d={ticketPath(box.w, box.h)} fill={w.mid} />
                  <Line x1={box.w - 96} y1={26} x2={box.w - 96} y2={box.h - 26} stroke={withAlpha(palette.butter, 0.7)} strokeWidth={2} strokeDasharray="5 6" />
                </Svg>
              ) : null}
              <View style={{ flex: 1, padding: 22, gap: 12 }}>
                <Text style={{ ...text.subheadline, fontFamily: fonts.rounded, fontWeight: '800', letterSpacing: 1.2, color: w.hot }}>{who(story, invite)} asked</Text>
                <DisplayText text={`“${invite.text}”`} type="wide" color={palette.butter} heading />
                <Text style={{ ...text.caption, fontWeight: '600', color: withAlpha(palette.butter, 0.85) }}>{attribution(story, invite)}</Text>
              </View>
              <View aria-hidden style={{ width: 96, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Text style={{ ...text.title3, fontFamily: fonts.rounded, fontWeight: '900', color: palette.butter, textAlign: 'center' }}>{dayLabel(story, invite.sentAt).toUpperCase()}</Text>
                <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} tintColor={palette.butter} size={20} />
              </View>
            </View>
          </Enter>
          {state.revealed === 0 ? (
            <Enter order={3}><TapPill title="See the answer" color={w.mid} ink={palette.butter} testID="wrappedReveal" onPress={onReveal} /></Enter>
          ) : (
            <Animated.View entering={FadeIn.duration(reduced ? 100 : 300)} style={{ alignItems: 'flex-end', gap: 6 }}>
              <Stamp seconds={answeredSeconds(h)} story={story} />
              <View style={{ alignSelf: 'stretch' }}>
                <Bubble quote={reply} story={story} fill={palette.ink} color={palette.butter} caption={withAlpha(palette.ink, 0.75)} />
              </View>
            </Animated.View>
          )}
          <Why h={h} color={withAlpha(palette.ink, 0.85)} order={4} />
        </View>
      </Scroll>
    </View>
  );
}

// Twist

export function TwistScene({ h, story, state, onReveal }: SceneProps) {
  const w = story.world;
  const slide = useSlide();
  const reduced = useReduced();
  const setup = quotesFor(h, 'setup')[0];
  const punch = quotesFor(h, 'punchline');
  const revealed = state.revealed > 0;
  const [panel, setPanel] = useState<{ w: number; h: number } | null>(null);
  const wipe = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    wipe.value = reduced ? (revealed ? 1 : 0) : withTiming(revealed ? 1 : 0, { duration: 550, easing: Easing.inOut(Easing.ease) });
  }, [revealed, reduced, wipe]);
  const ph = panel?.h ?? 0;
  const slant = (panel?.w ?? 0) * 0.07;
  const wipeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (ph + slant * 2) * (1 - wipe.value) }] }));
  return (
    <View style={fill}>
      <Gradient colors={[w.mid, w.deep]} />
      <Glow colors={[withAlpha(w.glow, 0.35), withAlpha(w.hot, 0.35)]} active={slide.active && !revealed} />
      <Scroll bottom={120}>
        <View style={{ gap: 22 }}>
          <Enter order={0}><Eyebrow text={h.headline} color={w.glow} /></Enter>
          <Enter order={1} distance={40}><DisplayText text={`“${setup.text}”`} type="typewriter" color={palette.butter} heading /></Enter>
          <Enter order={2}><Text style={{ ...text.caption, fontWeight: '600', color: withAlpha(w.glow, 0.9) }}>{attribution(story, setup)}</Text></Enter>
          <View style={{ paddingTop: 70, paddingBottom: 28, minHeight: 300, gap: 16 }} onLayout={(e) => setPanel({ w: e.nativeEvent.layout.width + 48, h: e.nativeEvent.layout.height })}>
            {panel ? (
              <View aria-hidden pointerEvents="none" style={{ position: 'absolute', left: -24, right: -24, top: 0, bottom: 0, overflow: 'hidden' }}>
                <Animated.View style={[fill, wipeStyle]}>
                  <Svg width={panel.w} height={panel.h + slant * 2}>
                    <Path d={`M0 ${slant * 2} L${panel.w} 0 L${panel.w} ${panel.h + slant * 2} L0 ${panel.h + slant * 2} Z`} fill="rgba(1, 30, 44, 0.94)" stroke="rgba(83, 105, 121, 1)" strokeWidth={1} />
                  </Svg>
                </Animated.View>
              </View>
            ) : null}
            {!revealed ? (
              <TapPill title="See how it ends" color={w.hot} ink={palette.ink} testID="wrappedReveal" onPress={onReveal} />
            ) : (
              punch.slice(0, state.revealed).map((q, i) => (
                <Animated.View key={q.messageID} entering={FadeIn.duration(reduced ? 100 : 240)}>
                  {i === punch.length - 1 ? (
                    <View style={{ gap: 8 }}>
                      <DisplayText text={`“${q.text}”`} color="#FFFFFF" />
                      <Text style={{ ...text.caption, fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)' }}>{attribution(story, q)}</Text>
                    </View>
                  ) : (
                    <Bubble quote={q} story={story} fill={palette.ink} color={palette.butter} caption={withAlpha(palette.ink, 0.75)} />
                  )}
                </Animated.View>
              ))
            )}
            <Why h={h} color={revealed ? withAlpha(palette.ink, 0.85) : withAlpha(w.glow, 0.9)} />
          </View>
        </View>
      </Scroll>
    </View>
  );
}

// Swerve

function bezierLength(points: number[][]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

/** Arc length of tangentPath(w, h), by sampling its line and two cubics. */
function tangentLength(w: number, h: number) {
  const cubic = (p0: number[], p1: number[], p2: number[], p3: number[]) =>
    Array.from({ length: 41 }, (_, k) => {
      const t = k / 40, u = 1 - t;
      return [0, 1].map((d) => u * u * u * p0[d] + 3 * u * u * t * p1[d] + 3 * u * t * t * p2[d] + t * t * t * p3[d]);
    });
  return (
    w * 0.44 +
    bezierLength(cubic([w * 0.44, h * 0.22], [w * 0.74, h * 0.22], [w * 0.42, h * 0.72], [w * 0.6, h * 0.88])) +
    bezierLength(cubic([w * 0.6, h * 0.88], [w * 0.8, h * 1.02], [w * 0.82, h * 0.45], [w * 0.97, h * 0.45]))
  );
}

export function PivotScene({ h, story, state, onReveal }: SceneProps) {
  const w = story.world;
  const slide = useSlide();
  const reduced = useReduced();
  const setup = quotesFor(h, 'setup')[0];
  const swerve = quotesFor(h, 'punchline')[0];
  const revealed = state.revealed > 0;
  const [width, setWidth] = useState(0);
  const drawn = useTween(revealed ? 1 : 0.3, reduced ? 100 : 1000, 0, 0.3);
  const length = width > 0 ? tangentLength(width, 150) : 1;
  return (
    <View style={fill}>
      <View style={[fill, { backgroundColor: w.deep, opacity: 0.4 }]} />
      <Glow colors={[w.mid, withAlpha(w.hot, 0.35)]} active={slide.active} />
      <Scroll>
        <View style={{ gap: 20 }}>
          <Enter order={0}><Eyebrow text={h.headline} color={w.glow} /></Enter>
          <Enter order={1} distance={34}>
            <Heading><Bubble quote={setup} story={story} fill={w.glow} color={palette.ink} caption={withAlpha(w.glow, 0.85)} /></Heading>
          </Enter>
          <Enter order={2}>
            <View aria-hidden style={{ height: 150 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              {width > 0 ? (
                <Svg width={width} height={150}>
                  <Path d={tangentPath(width, 150)} stroke={w.hot} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={`${length} ${length}`} strokeDashoffset={length * (1 - drawn)} />
                </Svg>
              ) : null}
            </View>
          </Enter>
          {!revealed ? (
            <Enter order={3}><TapPill title="What came next?" color={w.hot} ink={palette.ink} testID="wrappedReveal" onPress={onReveal} /></Enter>
          ) : (
            <Animated.View entering={reduced ? FadeIn.duration(100) : SlideInRight.duration(450)} style={{ gap: 20 }}>
              <Eyebrow text={`${formatElapsed(answeredSeconds(h))} later`} color={w.glow} />
              <DisplayText text={`“${swerve.text}”`} type="rounded" color={palette.butter} style={{ transform: [{ rotate: reduced ? '0deg' : '2deg' }] }} />
              <Text style={{ ...text.caption, fontWeight: '600', color: withAlpha(w.glow, 0.9) }}>{attribution(story, swerve)}</Text>
            </Animated.View>
          )}
          <Why h={h} color={withAlpha(w.glow, 0.9)} order={4} />
        </View>
      </Scroll>
    </View>
  );
}

// Reply gaps

function GapBar({ seconds, fraction, color, delay }: { seconds: number; fraction: number; color: string; delay: number }) {
  const reduced = useReduced();
  const p = useSharedValue(reduced ? 1 : 0.02);
  useEffect(() => {
    if (!reduced) p.value = withDelay(delay + 200, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [reduced, delay, p]);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  const elapsed = formatElapsed(seconds);
  return (
    <View accessible accessibilityLabel={`Gap of ${elapsed}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, height: 16 }}>
        <Animated.View style={[{ width: `${Math.max(fraction * 100, 6)}%`, height: 16, borderRadius: 8, backgroundColor: color, transformOrigin: 'left' }, bar]} />
      </View>
      <Text style={{ ...text.caption, fontWeight: '700', color: palette.butter }}>{elapsed}</Text>
    </View>
  );
}

export function GhostScene({ h, story, state, onReveal }: SceneProps) {
  const w = story.world;
  const slide = useSlide();
  const revealed = state.revealed > 0;
  const gaps = h.figure.kind === 'gaps' ? [...h.figure.seconds].sort((a, b) => b - a) : [];
  const longest = Math.max(gaps[0] ?? 1, 1);
  const bob = useRepeat(2200, { active: slide.active, rest: 0.5 });
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 8 - 16 * bob.value }] }));
  const count = Math.round(useTween(revealed ? gaps.length : 0, 1200));
  return (
    <View style={fill}>
      <Gradient colors={[w.deep, withAlpha(w.mid, 0.85), w.deep]} />
      <Stars color={w.glow} active={slide.active} />
      <Scroll>
        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, gap: 10 }}>
              <Enter order={0}><Eyebrow text="Your reply habits" color={w.glow} /></Enter>
              <Enter order={1} distance={40}><DisplayText text={h.headline} type="wide" color={palette.butter} heading /></Enter>
            </View>
            <Animated.View aria-hidden style={[{ width: 70, height: 82 }, bobStyle]}>
              <Svg width={70} height={82}>
                <Path d={ghostPath(70, 82)} fill={w.glow} />
              </Svg>
              <View style={{ position: 'absolute', top: 35, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                <View style={{ width: 7, height: 12, borderRadius: 4, backgroundColor: w.deep }} />
                <View style={{ width: 7, height: 12, borderRadius: 4, backgroundColor: w.deep }} />
              </View>
            </Animated.View>
          </View>
          <Enter order={2}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: withAlpha(w.glow, 0.7) }}>
              <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} tintColor={w.glow} size={12} />
              <Text style={{ ...text.caption, fontWeight: '700', color: w.glow }}>Private unless you choose to share it.</Text>
            </View>
          </Enter>
          <Enter order={3}><Text style={{ ...text.title3, fontFamily: fonts.rounded, fontWeight: '700', color: w.glow }}>{h.prompt}</Text></Enter>
          {!revealed ? (
            <Enter order={4}><TapPill title="Reveal the receipts" color={w.hot} ink={palette.ink} testID="wrappedReveal" onPress={onReveal} /></Enter>
          ) : (
            <View style={{ gap: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
                <View style={{ width: 140 }}>
                  <GradientText lines={[String(count)]} colors={rainbowText} size={112} family={fonts.serif} weight="400" widthPerChar={0.62} label={String(gaps.length)} />
                </View>
                <Text style={{ ...text.title2, fontFamily: fonts.rounded, fontWeight: '800', color: palette.butter, flex: 1, marginBottom: 18 }}>{h.quantity?.label ?? ''}</Text>
              </View>
              <View style={{ gap: 10 }}>
                {gaps.map((g, i) => <GapBar key={i} seconds={g} fraction={g / longest} color={i === 0 ? w.hot : w.glow} delay={i * 150} />)}
              </View>
              <Why h={h} color={withAlpha(w.glow, 0.9)} />
            </View>
          )}
        </View>
      </Scroll>
    </View>
  );
}

// Busiest day

function DayBar({ height, color, grow, delay }: { height: number; color: string; grow: boolean; delay: number }) {
  const reduced = useReduced();
  const p = useSharedValue(reduced ? 1 : 0.03);
  useEffect(() => {
    if (!reduced) p.value = withDelay(delay, withSpring(1, { duration: 700, dampingRatio: 0.75 }));
  }, [reduced, delay, p]);
  const style = useAnimatedStyle(() => ({ height: grow ? Math.max(height * p.value, 3) : 4 }));
  return <Animated.View style={[{ flex: 1, borderRadius: 999, backgroundColor: color }, style]} />;
}

export function BusiestScene({ h, story, state, onReveal }: SceneProps) {
  const w = story.world;
  const slide = useSlide();
  const revealed = state.revealed > 0;
  const counts = h.figure.kind === 'dailyCounts' ? h.figure.counts : [];
  const peak = h.figure.kind === 'dailyCounts' ? h.figure.peak : 0;
  const most = Math.max(...counts, 1);
  const context = quotesFor(h, 'context');
  const first = context[0], last = context[context.length - 1];
  const number = Math.round(useTween(revealed ? Number(h.quantity?.value ?? 0) : 0, 1000));
  return (
    <View style={fill}>
      <Gradient colors={[w.deep, w.mid]} />
      <Glow colors={[withAlpha(w.hot, 0.5), withAlpha(w.glow, 0.3)]} active={slide.active} />
      <Scroll>
        <View style={{ gap: 20 }}>
          <Enter order={0}><Eyebrow text="By the numbers" color={w.glow} /></Enter>
          <Enter order={1} distance={40}><DisplayText text={h.headline} type="poster" color={palette.butter} heading /></Enter>
          <Enter order={2}><Text style={{ ...text.title3, fontFamily: fonts.rounded, fontWeight: '700', color: w.glow }}>{h.prompt}</Text></Enter>
          <Enter order={3}>
            <View accessible accessibilityLabel={`Messages per day across ${counts.length} days`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: counts.length > 40 ? 2 : 5, height: 176 }}>
              {counts.map((c, i) => (
                <DayBar key={i} height={(c / most) * 170 + 4} color={i === peak && revealed ? w.hot : withAlpha(w.glow, 0.45)} grow={revealed || i !== peak} delay={i * 30} />
              ))}
            </View>
          </Enter>
          {!revealed ? (
            <Enter order={4}><TapPill title="Reveal the day" color={w.hot} ink={palette.ink} testID="wrappedReveal" onPress={onReveal} /></Enter>
          ) : (
            <View style={{ gap: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
                <Text accessibilityLabel={h.quantity?.value ?? ''} style={{ fontFamily: fonts.serif, fontWeight: '400', fontSize: 120, lineHeight: 128, color: w.hot, ...lift }}>{number}</Text>
                <Text style={{ ...text.title2, fontFamily: fonts.rounded, fontWeight: '800', color: palette.butter, marginBottom: 18 }}>{h.quantity?.label ?? ''}</Text>
              </View>
              <Text style={{ ...text.headline, fontWeight: '700', color: palette.butter }}>{h.quantity?.detail ?? ''}</Text>
              {first && last ? (
                <>
                  <Eyebrow text="First text of the day" color={w.glow} />
                  <Bubble quote={first} story={story} fill={w.glow} color={palette.ink} caption={withAlpha(w.glow, 0.85)} />
                  <Eyebrow text="Last text of the day" color={w.glow} />
                  <Bubble quote={last} story={story} fill={w.hot} color={palette.ink} caption={withAlpha(w.glow, 0.85)} />
                </>
              ) : null}
              <Why h={h} color={withAlpha(w.glow, 0.9)} />
            </View>
          )}
        </View>
      </Scroll>
    </View>
  );
}

// Warm moment (only when the warm setting is on)

export function WarmScene({ h, story, state, onReveal }: SceneProps) {
  const w = story.world;
  const slide = useSlide();
  const first = quotesFor(h, 'setup')[0];
  const reply = quotesFor(h, 'punchline')[0];
  const breathe = useRepeat(3000, { active: slide.active, rest: 0.5 });
  const glow = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + 0.16 * breathe.value }] }));
  return (
    <View style={fill}>
      <Gradient colors={[w.deep, withAlpha(palette.plum, 0.75)]} />
      <View pointerEvents="none" aria-hidden style={[fill, { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={[{ width: 520, height: 520, marginTop: 240 }, glow]}>
          <Svg width={520} height={520}>
            <Defs>
              <RadialGradient id="warm" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={palette.butter} stopOpacity={0.55} />
                <Stop offset="1" stopColor={palette.butter} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={260} cy={260} r={260} fill="url(#warm)" />
          </Svg>
        </Animated.View>
      </View>
      <Scroll>
        <View style={{ gap: 22 }}>
          <Enter order={0}><Eyebrow text="A soft spot" color={palette.coral} /></Enter>
          <Enter order={1} distance={40}><DisplayText text={h.headline} color={palette.butter} heading /></Enter>
          <Enter order={2} distance={34}><Bubble quote={first} story={story} fill={palette.periwinkle} color={palette.ink} caption={withAlpha(palette.butter, 0.85)} /></Enter>
          {reply ? (
            state.revealed > 0 ? (
              <Animated.View entering={FadeIn.duration(300)}>
                <Bubble quote={reply} story={story} fill={palette.coral} color={palette.ink} caption={withAlpha(palette.butter, 0.85)} />
              </Animated.View>
            ) : (
              <Enter order={3}><TapPill title="Read the reply" color={palette.coral} ink={palette.ink} testID="wrappedReveal" onPress={onReveal} /></Enter>
            )
          ) : null}
          <Why h={h} color={withAlpha(palette.butter, 0.9)} order={4} />
        </View>
      </Scroll>
    </View>
  );
}

// Finale

export function FinaleScene({ edition, story, editionCount, wider, onAnother, onShare, onWiden, onEditions }: {
  edition: WrappedEdition; story: Story; editionCount: number; wider: WrappedDateRange | null;
  onAnother: () => void; onShare: () => void; onWiden: (r: WrappedDateRange) => void; onEditions: () => void;
}) {
  const w = story.world;
  const slide = useSlide();
  const name = friendName(story);
  const notes = ['I checked every quote against the original message, sender and time.'];
  if (edition.leftOutCount > 0) notes.push(`I left out ${edition.leftOutCount} message${edition.leftOutCount === 1 ? '' : 's'} that looked private or like conflict.`);
  return (
    <View style={fill}>
      <Gradient colors={[w.deep, w.mid, w.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <Glow colors={[withAlpha(w.hot, 0.6), withAlpha(w.glow, 0.4), w.mid]} active={slide.active} />
      <Scroll>
        <View style={{ gap: 18 }}>
          <Enter order={0}><Eyebrow text={`Edition ${edition.number} of ${editionCount}`} color={w.glow} /></Enter>
          <View pointerEvents="none" aria-hidden style={{ position: 'absolute', right: -190, top: -170, opacity: 0.45 }}>
            <RainbowRing size={420} stroke={16} active={slide.active} />
          </View>
          <Enter order={1} distance={40}>
            <GradientText lines={['Cheers to you', `and ${name}.`]} colors={rainbowText} size={58} family={fonts.serif} weight="400" lineHeight={1.05} widthPerChar={0.44} label={`Cheers to you and ${name}.`} heading />
          </Enter>
          <Enter order={1}>
            <Text style={{ ...text.headline, fontFamily: fonts.rounded, fontWeight: '700', color: palette.butter }}>That’s what I found in {rangeLabel(story.range, story.locale)}.</Text>
          </Enter>
          <Enter order={2} style={{ gap: 10 }}>
            {edition.highlights.map((h, i) => (
              <View key={h.id} accessible accessibilityLabel={`${i + 1}. ${h.headline}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
                <Text style={{ ...text.title3, fontFamily: fonts.serif, fontWeight: '400', color: w.hot }}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={{ ...text.headline, fontFamily: fonts.rounded, fontWeight: '700', color: palette.butter, flex: 1 }}>{h.headline}</Text>
              </View>
            ))}
          </Enter>
          <Enter order={3}><Footnote color={withAlpha(w.glow, 0.9)}>{notes.join(' ')}</Footnote></Enter>
          <Enter order={4} style={{ gap: 12, alignItems: 'center' }}>
            <WideButton title="Another edition" fill={w.glow} ink={palette.ink} testID="wrappedAnotherEdition" onPress={onAnother} icon={{ ios: 'arrow.triangle.2.circlepath', android: 'autorenew', web: 'autorenew' }} />
            <WideButton title="Choose what to share" fill={null} ink={palette.butter} testID="wrappedShareButton" onPress={onShare} icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} />
            {wider ? <LinkButton title={`Try ${rangeLabel(wider, story.locale)}`} color={w.glow} testID="wrappedWiden" onPress={() => onWiden(wider)} icon={{ ios: 'calendar.badge.plus', android: 'calendar_month', web: 'calendar_month' }} /> : null}
            {editionCount > 1 ? <LinkButton title="Earlier editions" color={w.glow} testID="wrappedEditionMenu" onPress={onEditions} icon={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }} /> : null}
          </Enter>
        </View>
      </Scroll>
    </View>
  );
}

function LinkButton({ title, color, testID, onPress, icon }: { title: string; color: string; testID: string; onPress: () => void; icon: Parameters<typeof SymbolView>[0]['name'] }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
      <SymbolView name={icon} tintColor={color} size={18} />
      <Text style={{ ...text.subheadline, fontFamily: fonts.rounded, fontWeight: '800', color }}>{title}</Text>
    </Pressable>
  );
}

// Message slides: loading, exhausted, empty, failed

export interface MessageAction {
  title: string;
  id: string;
  primary: boolean;
  run: () => void;
}

export function MessageScene({ title, message, story, friend, actions }: { title: string; message: string; story: Story; friend: string | null; actions: MessageAction[] }) {
  const w = story.world;
  const slide = useSlide();
  return (
    <View style={fill}>
      <Gradient colors={[w.deep, withAlpha(w.mid, 0.9)]} />
      <Glow colors={[withAlpha(w.hot, 0.4), w.mid]} active={slide.active} />
      <Scroll>
        <View style={{ gap: 20 }}>
          <Enter order={0}><Eyebrow text={friend ? `Wrapped · ${friend}` : 'Wrapped'} color={w.glow} /></Enter>
          <Enter order={1} distance={40}><DisplayText text={title} type="wide" color={palette.butter} heading /></Enter>
          <Enter order={2}><Text style={{ ...text.body, fontWeight: '500', color: withAlpha(palette.butter, 0.92) }}>{message}</Text></Enter>
          {actions.map((a) => (
            <Enter key={a.id} order={3}>
              <WideButton title={a.title} fill={a.primary ? w.glow : null} ink={a.primary ? palette.ink : palette.butter} testID={a.id} onPress={a.run} />
            </Enter>
          ))}
        </View>
      </Scroll>
    </View>
  );
}

const styles = StyleSheet.create({
  guessDock: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 14 },
});
