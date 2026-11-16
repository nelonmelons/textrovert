import type { TextStyle } from 'react-native';

/**
 * Textrovert on Ditto's frontpage design (austincupid.com; dodo-world/ditto apps/frontpage). Only the frontpage's
 * elements, nothing older:
 *
 * - scenes: the painted, dithered sky and the blue-duotone photographs;
 * - type: white Spencer titles with a navy shadow, a Bitter Sour script accent, Arial for text, SF for iMessage;
 * - labels: black stickers with one pink word;
 * - surfaces: the FAQ's house glass for lists (#011E2C at 40%, blur 24, a slate rim), the Enroll card's form glass for
 *   forms and controls (white/10, blur 10, a white lit rim), and deep-blue sections with scalloped edges;
 * - fields: 46pt, 16pt corners, black/10, white text, white/50 placeholders;
 * - actions: the white pill with navy ink (48pt, 28pt corners, bold 16), and form-glass pills with white ink;
 * - chat: Messages' bubbles (grey #E9E9EB with black ink, blue #1F8FFF→#0A7CFF with white) and contact avatars;
 * - pink #F748B1 only for accent words, chevrons and counts.
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

/** The frontpage's colours. */
export const ditto = {
  /** Accent words, chevrons, counts. */
  primary: '#F748B1',
  pink: '#F748B1',
  /** Page canvas behind scenes, the footer, and the primary pill's ink. */
  nu7: '#081721',
  navy: '#081721',
  /** The FAQ card's fill (at 40%) and slate rim. */
  house: '#011E2C',
  slate: '#536979',
  /** The hero sky's top colour, and the title shadow's navy. */
  skyTop: '#557C86',
  deepBlue: '#0E2860',
  /** Deep-blue sections under a scalloped edge. */
  section: '#1B4384',
  sectionDeep: '#0F2B60',
  teal: '#759DA7',
  /** Footer headings. */
  zinc: '#A1A1AA',
  /** Validation errors (the Enroll form's). */
  error: '#FFB4B4',
  /** Messages. */
  bubbleIn: '#E9E9EB',
  bubbleOutTop: '#1F8FFF',
  bubbleOut: '#0A7CFF',
  ink: '#081721',
} as const;

const frontpage = {
  background: ditto.navy,
  grouped: ditto.navy,
  /** House glass: lists and cards of white copy. */
  surface: 'rgba(1, 30, 44, 0.4)',
  /** Form glass: forms, controls, pills. */
  surfaceMuted: 'rgba(255, 255, 255, 0.1)',
  fill: 'rgba(255, 255, 255, 0.1)',
  fillStrong: 'rgba(255, 255, 255, 0.2)',
  edge: 'rgba(255, 255, 255, 0.2)',
  separator: 'rgba(255, 255, 255, 0.1)',
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.8)',
  textTertiary: 'rgba(255, 255, 255, 0.5)',
  accent: ditto.primary,
  accentEdge: ditto.primary,
  accentText: ditto.primary,
  accentSoft: 'rgba(247, 72, 177, 0.2)',
  onAccent: '#FFFFFF',
  /** The primary pill: white with navy ink. */
  key: '#FFFFFF',
  keyInk: ditto.navy,
  thumb: '#FFFFFF',
  /** Fields: black/10 inside form glass. */
  input: 'rgba(0, 0, 0, 0.1)',
  placeholder: 'rgba(255, 255, 255, 0.5)',
  bubbleTheirs: ditto.bubbleIn,
  bubbleMine: ditto.bubbleOut,
  bubbleText: '#000000',
  bubbleMineText: '#FFFFFF',
  bubbleName: 'rgba(0, 0, 0, 0.5)',
  bubbleTime: 'rgba(0, 0, 0, 0.4)',
  bubbleMineTime: 'rgba(255, 255, 255, 0.7)',
  darkCard: 'rgba(1, 30, 44, 0.4)',
  darkCell: 'rgba(255, 255, 255, 0.06)',
  darkCellEdge: 'rgba(255, 255, 255, 0.1)',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255, 255, 255, 0.8)',
  tabBar: 'rgba(255, 255, 255, 0.1)',
  tabBarEdge: 'rgba(255, 255, 255, 0.5)',
  overlay: 'rgba(8, 23, 33, 0.55)',
  /** Sheets: the house glass, near-opaque. */
  sheet: 'rgba(1, 30, 44, 0.92)',
  success: '#FFFFFF',
  danger: ditto.error,
};

export type Colors = typeof frontpage;

export const palette: Record<Scheme, Colors> = { light: frontpage, dark: frontpage };

/**
 * Avatar fills. The frontpage has no colour-coded avatars, so every name lands on Messages' grey contact avatar; the
 * names stay so older call sites keep compiling.
 */
const contact = { fill: '#9AA1AD', edge: '#7E8592', ink: '#FFFFFF' } as const;
export const fills = { pink: contact, mint: contact, yellow: contact, peach: contact, lilac: contact, blue: contact, coral: contact, lime: contact, white: contact } as const;
export type FillName = keyof typeof fills;
export const avatarFills = ['pink', 'mint', 'yellow', 'peach', 'lilac', 'blue', 'coral', 'lime'] as const satisfies readonly FillName[];
export function fillFor(_seed: string): FillName {
  return 'blue';
}
/** Messages' contact avatar gradient. */
export const contactGradient = ['#A9AFBB', '#868C98'] as const;
export const tileGradient = (_name: FillName) => contactGradient;

/**
 * Type: Spencer (one weight) for display through title2 and for big numbers, Bitter Sour for script, Arial for the rest.
 */
export const type = {
  display: { fontSize: 48, lineHeight: 46, fontWeight: '400', letterSpacing: -0.4 },
  largeTitle: { fontSize: 38, lineHeight: 38, fontWeight: '400', letterSpacing: -0.3 },
  title1: { fontSize: 30, lineHeight: 31, fontWeight: '400', letterSpacing: -0.2 },
  title2: { fontSize: 24, lineHeight: 26, fontWeight: '400', letterSpacing: -0.1 },
  title3: { fontSize: 18, lineHeight: 23, fontWeight: '700' },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 19.5, fontWeight: '400' },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0 },
  /** Big numbers, in Spencer. */
  stat: { fontSize: 40, lineHeight: 40, fontWeight: '400', letterSpacing: -0.4 },
  script: { fontSize: 34, lineHeight: 40, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

export type TypeName = keyof typeof type;
export const serifVariants: readonly TypeName[] = ['display', 'largeTitle', 'title1', 'title2', 'stat'];

/** The frontpage title shadow, lit from the top left and falling down-right in navy. */
export const titleShadow = { textShadowColor: 'rgba(14, 40, 96, 0.38)', textShadowOffset: { width: 2, height: 4 }, textShadowRadius: 8 } as const;
/** The frontpage's small-text lift (0 1px 2px rgba(12, 34, 80, .35)). */
export const softShadow = { textShadowColor: 'rgba(12, 34, 80, 0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } as const;

/** 4pt grid. Screens use a 16pt gutter, as the frontpage's phone layouts do. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48, gutter: 16 };

/** Radii from the frontpage: fields 16, cards 24, form cards 32, pills 28 or round. */
export const radii = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, sheet: 32, pill: 999, field: 16, button: 28, bubble: 18, bubbleTail: 18 };
export const iconRadius = (size: number) => size / 2;

/** No lips: the frontpage is flat glass. Kept for older call sites. */
export const lip = { button: 0, pill: 0, card: 0, tile: 0 };

const shadowSet = {
  avatar: '0px 1px 4px rgba(12, 34, 80, 0.3)',
  bubble: 'none',
  card: '0px 1px 2px rgba(0, 0, 0, 0.05)',
  float: '0px 30px 90px rgba(12, 34, 80, 0.28)',
  thumb: '0px 1px 2px rgba(0, 0, 0, 0.05)',
  glow: 'none',
  /** Form glass's inner light (0 1px 4px 0 rgba(255,255,255,.25) inset). */
  inset: 'inset 0px 1px 4px 0px rgba(255, 255, 255, 0.25)',
};
export const shadows: Record<Scheme, typeof shadowSet> = { light: shadowSet, dark: shadowSet };

export const springs = {
  press: { damping: 20, stiffness: 520, mass: 0.6 },
  release: { damping: 12, stiffness: 320, mass: 0.7 },
  snappy: { damping: 22, stiffness: 300, mass: 0.8 },
  sheet: { damping: 26, stiffness: 240, mass: 1 },
  gentle: { damping: 14, stiffness: 120, mass: 1 },
};

/** The frontpage's motion: 200-300ms ease-out. */
export const durations = { fast: 200, base: 300, slow: 500, scan: 2800 };
