import type { TextStyle } from 'react-native';

/**
 * Textrovert on Ditto's frontpage design language (austincupid.com, dodo-world/ditto apps/frontpage): painted, dithered
 * skies and blue-duotone photographs, white Spencer titles with a soft navy shadow, a Bitter Sour script accent, black
 * sticker labels with one pink word, clear liquid glass, white pills with ink text for the main action, teal sections
 * with scalloped edges, and Ditto pink (#F748B1) for accents.
 *
 * The frontpage is always white-on-scene, so both schemes resolve to the same palette.
 */
export type Scheme = 'light' | 'dark';

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const channels = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

/** Blends two #RRGGBB colours; amount 0 is the first, 1 the second. */
export function mix(a: string, b: string, amount: number) {
  const [x, y] = [channels(a), channels(b)];
  return '#' + x.map((v, i) => hex(v + (y[i] - v) * amount)).join('');
}

/** A #RRGGBB colour at another opacity. */
export function withAlpha(color: string, alpha: number) {
  const [r, g, b] = channels(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Ditto's v3 palette (apps/web-app/src/styles/application-theme-v3.scss). */
export const ditto = {
  primary: '#F748B1',
  pink: '#FF2CAB',
  accent: '#6366F1',
  success: '#10B981',
  error: '#EF4444',
  nu1: '#FFFFFF',
  nu2: '#BCC9D3',
  nu3: '#8E989F',
  nu4: '#72828D',
  nu5: '#163049',
  nu6: '#233039',
  nu7: '#081721',
  nu8: '#1E2319',
  /** Frontpage: ink, paper, the section teal, the painted sky's top, the title-shadow navy, zinc. */
  ink: '#262523',
  paper: '#F7F7F2',
  teal: '#759DA7',
  skyTop: '#557C86',
  deepBlue: '#0E2860',
  zinc: '#A1A1AA',
} as const;

const glass = {
  /** The canvas under the photograph, and what shows before it loads. */
  background: ditto.nu7,
  grouped: ditto.nu7,
  /** Content cards: navy glass, dark enough for white body copy on a bright sky. */
  surface: 'rgba(8, 23, 33, 0.5)',
  /** Chrome: Ditto's white glass (white/10). */
  surfaceMuted: 'rgba(255, 255, 255, 0.1)',
  fill: 'rgba(255, 255, 255, 0.12)',
  fillStrong: 'rgba(255, 255, 255, 0.22)',
  edge: 'rgba(255, 255, 255, 0.2)',
  separator: 'rgba(255, 255, 255, 0.12)',
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textTertiary: 'rgba(255, 255, 255, 0.48)',
  accent: ditto.primary,
  accentEdge: '#D61B8C',
  /** Pink that still reads as text on navy glass. */
  accentText: '#FF7BCB',
  accentSoft: 'rgba(255, 44, 171, 0.2)',
  onAccent: '#FFFFFF',
  /** The primary key: the frontpage's white pill with ink ("Message Ditto to Join"). */
  key: 'rgba(255, 255, 255, 0.95)',
  keyInk: ditto.ink,
  thumb: 'rgba(255, 255, 255, 0.95)',
  input: 'rgba(35, 48, 57, 0.72)',
  placeholder: ditto.nu3,
  bubbleTheirs: 'rgba(255, 255, 255, 0.14)',
  bubbleMine: 'rgba(255, 255, 255, 0.95)',
  bubbleText: '#FFFFFF',
  bubbleMineText: ditto.nu7,
  bubbleName: '#FF7BCB',
  bubbleTime: 'rgba(255, 255, 255, 0.55)',
  bubbleMineTime: 'rgba(8, 23, 33, 0.45)',
  darkCard: 'rgba(8, 23, 33, 0.62)',
  darkCell: 'rgba(255, 255, 255, 0.08)',
  darkCellEdge: 'rgba(255, 255, 255, 0.14)',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255, 255, 255, 0.62)',
  tabBar: 'transparent',
  tabBarEdge: 'transparent',
  overlay: 'rgba(4, 12, 18, 0.55)',
  sheet: 'rgba(8, 23, 33, 0.92)',
  success: ditto.success,
  danger: '#FF6B6B',
};

export type Colors = typeof glass;

export const palette: Record<Scheme, Colors> = { light: glass, dark: glass };

/**
 * Avatar and tile fills: a face, a darker edge for the ring, and the ink that reads on it. Tuned to sit on Ditto's
 * blue skies: pinks, lilacs and warm pastels rather than primaries.
 */
export const fills = {
  pink: { fill: '#FF8AD0', edge: '#F748B1', ink: '#081721' },
  mint: { fill: '#8FE3C4', edge: '#4CC69B', ink: '#081721' },
  yellow: { fill: '#FFE08A', edge: '#F2C14E', ink: '#081721' },
  peach: { fill: '#FFC2A6', edge: '#F59A74', ink: '#081721' },
  lilac: { fill: '#C9B8FF', edge: '#9F87F5', ink: '#081721' },
  blue: { fill: '#9CC8FF', edge: '#5C9CF2', ink: '#081721' },
  coral: { fill: '#FF9DAE', edge: '#F26A84', ink: '#081721' },
  lime: { fill: '#D4F59A', edge: '#A6D45C', ink: '#081721' },
  white: { fill: '#FFFFFF', edge: '#DDE6EE', ink: '#081721' },
} as const;

export type FillName = keyof typeof fills;
/** The fills a name can land on; white is reserved for app and platform icons. */
export const avatarFills = ['pink', 'mint', 'yellow', 'peach', 'lilac', 'blue', 'coral', 'lime'] as const satisfies readonly FillName[];

/** The same name always gets the same fill. */
export function fillFor(seed: string): FillName {
  let h = 5381;
  for (const ch of seed.trim().toLowerCase()) h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0;
  return avatarFills[h % avatarFills.length];
}

/** Top-to-bottom gradient for an app-icon tile cut from a fill. */
export const tileGradient = (name: FillName) => [mix(fills[name].fill, '#FFFFFF', 0.35), fills[name].fill] as const;

/**
 * Type: Spencer (serif, one weight) for display through title2, Argent Pixel for big numbers, Arial for the rest.
 * Txt resolves each variant to its family; serif sizes carry no weight because Spencer has only the one.
 */
export const type = {
  display: { fontSize: 44, lineHeight: 46, fontWeight: '400', letterSpacing: -0.4 },
  largeTitle: { fontSize: 36, lineHeight: 39, fontWeight: '400', letterSpacing: -0.3 },
  title1: { fontSize: 30, lineHeight: 33, fontWeight: '400', letterSpacing: -0.2 },
  title2: { fontSize: 24, lineHeight: 28, fontWeight: '400', letterSpacing: -0.1 },
  title3: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.6 },
  stat: { fontSize: 40, lineHeight: 44, fontWeight: '400', letterSpacing: 0 },
  /** Bitter Sour, the hand-lettered accent under a title. */
  script: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

export type TypeName = keyof typeof type;
export const serifVariants: readonly TypeName[] = ['display', 'largeTitle', 'title1', 'title2'];

/** The frontpage title shadow: lit from the top left, falling down-right in navy (rgba(14, 40, 96)). */
export const titleShadow = { textShadowColor: 'rgba(14, 40, 96, 0.38)', textShadowOffset: { width: 2, height: 4 }, textShadowRadius: 8 } as const;
export const softShadow = { textShadowColor: 'rgba(12, 34, 80, 0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } as const;

/** 4pt grid. Screens use Ditto's 16pt gutter. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48, gutter: 16 };

/** Ditto radii: pills for every control, 24 for cards, 32 for the screen and sheets. */
export const radii = { xs: 6, sm: 10, md: 16, lg: 20, xl: 24, xxl: 28, sheet: 32, pill: 999, bubble: 20, bubbleTail: 6 };
export const iconRadius = (size: number) => Math.round(size * 0.2237);

/** Ditto controls are flat glass: no lip. Kept for components that still take one. */
export const lip = { button: 0, pill: 0, card: 0, tile: 0 };

/** CSS-style box shadows (React Native's boxShadow). */
const shadowSet = {
  avatar: '0px 6px 16px rgba(4, 12, 18, 0.25)',
  bubble: '0px 2px 10px rgba(4, 12, 18, 0.12)',
  card: '0px 14px 40px rgba(12, 34, 80, 0.28)',
  float: '0px 24px 48px rgba(4, 12, 18, 0.4)',
  thumb: '0px 2px 8px rgba(4, 12, 18, 0.18)',
  glow: '0px 0px 18px rgba(247, 72, 177, 0.55)',
  /** The liquid-glass rim: a lit top edge and a faint inner ring (the frontpage phone). */
  inset: 'inset 0px 1px 0px rgba(255, 255, 255, 0.75), inset 0px 0px 0px 4px rgba(255, 255, 255, 0.05)',
};
export const shadows: Record<Scheme, typeof shadowSet> = { light: shadowSet, dark: shadowSet };

/** Reanimated spring configs. */
export const springs = {
  press: { damping: 20, stiffness: 520, mass: 0.6 },
  release: { damping: 12, stiffness: 320, mass: 0.7 },
  snappy: { damping: 22, stiffness: 300, mass: 0.8 },
  sheet: { damping: 26, stiffness: 240, mass: 1 },
  gentle: { damping: 14, stiffness: 120, mass: 1 },
};

/** Ditto motion: 250ms smooth-out for most things. */
export const durations = { fast: 160, base: 250, slow: 360, scan: 2800 };
