import type { TextStyle } from 'react-native';

/**
 * Textrovert design v2 tokens: white (or near-black) canvas, big tight Geist type, saturated avatar fills with a
 * darker edge, and tactile surfaces that sit on a solid "lip" so they read as pressable.
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

const light = {
  background: '#FFFFFF',
  grouped: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F1',
  fill: 'rgba(120, 120, 128, 0.12)',
  fillStrong: 'rgba(120, 120, 128, 0.2)',
  edge: '#E6E6E6',
  separator: 'rgba(60, 60, 67, 0.12)',
  text: '#0A0A0A',
  textSecondary: '#737373',
  textTertiary: '#A3A3A3',
  accent: '#4F98F8',
  accentEdge: '#2F78DC',
  accentText: '#2F78DC',
  accentSoft: '#EAF2FE',
  onAccent: '#FFFFFF',
  thumb: '#FFFFFF',
  bubbleTheirs: '#FFFFFF',
  bubbleMine: '#D9FDD3',
  bubbleText: '#111B21',
  bubbleName: '#4F98F8',
  bubbleTime: 'rgba(17, 27, 33, 0.42)',
  darkCard: '#111113',
  darkCell: '#1B1B1E',
  darkCellEdge: '#26262A',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255, 255, 255, 0.58)',
  tabBar: 'rgba(250, 250, 250, 0.92)',
  tabBarEdge: 'rgba(0, 0, 0, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.25)',
  success: '#34C759',
  danger: '#FF3B30',
};

export type Colors = typeof light;

const dark: Colors = {
  background: '#0A0A0B',
  grouped: '#161618',
  surface: '#161618',
  surfaceMuted: '#141416',
  fill: 'rgba(120, 120, 128, 0.24)',
  fillStrong: 'rgba(120, 120, 128, 0.34)',
  edge: '#2A2A2E',
  separator: 'rgba(84, 84, 88, 0.45)',
  text: '#F5F5F7',
  textSecondary: '#98989F',
  textTertiary: '#636368',
  accent: '#4F98F8',
  accentEdge: '#2F78DC',
  accentText: '#6EABFA',
  accentSoft: 'rgba(79, 152, 248, 0.18)',
  onAccent: '#FFFFFF',
  thumb: '#5A5A5F',
  bubbleTheirs: '#222225',
  bubbleMine: '#1C4A31',
  bubbleText: '#ECEDEE',
  bubbleName: '#6EABFA',
  bubbleTime: 'rgba(236, 237, 238, 0.45)',
  darkCard: '#161618',
  darkCell: '#202024',
  darkCellEdge: '#2D2D32',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255, 255, 255, 0.58)',
  tabBar: 'rgba(28, 28, 30, 0.9)',
  tabBarEdge: 'rgba(255, 255, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  success: '#30D158',
  danger: '#FF453A',
};

export const palette: Record<Scheme, Colors> = { light, dark };

/**
 * Avatar and tile fills: a saturated face, a darker edge for the ring and lip, and the ink that reads on it.
 * They stay the same in dark mode, where they glow against the near-black canvas.
 */
export const fills = {
  pink: { fill: '#FF90E8', edge: '#E070C8', ink: '#0A0A0A' },
  mint: { fill: '#7EE0B5', edge: '#55C493', ink: '#0A0A0A' },
  yellow: { fill: '#FFC900', edge: '#DBA800', ink: '#0A0A0A' },
  peach: { fill: '#FFB38A', edge: '#E8936A', ink: '#0A0A0A' },
  lilac: { fill: '#C4B5FD', edge: '#A593EF', ink: '#0A0A0A' },
  blue: { fill: '#5099F9', edge: '#2F78DC', ink: '#FFFFFF' },
  coral: { fill: '#FF8F8F', edge: '#E26B6B', ink: '#0A0A0A' },
  lime: { fill: '#C8F07A', edge: '#A0CC4E', ink: '#0A0A0A' },
  white: { fill: '#FFFFFF', edge: '#E6E6E6', ink: '#0A0A0A' },
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
export const tileGradient = (name: FillName) => [mix(fills[name].fill, '#FFFFFF', 0.28), fills[name].fill] as const;

/** Big, tight, bold Geist headlines over calm iOS body sizes. Txt maps each weight to its Geist face. */
export const type = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2 },
  largeTitle: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.9 },
  title1: { fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.6 },
  title2: { fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.4 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: -0.2 },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.15 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.1 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  stat: { fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type TypeName = keyof typeof type;

/** 4pt grid. Screens use a 20pt gutter. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48, gutter: 20 };

/** Continuous-corner radii. App icons use the iOS icon ratio of their size. */
export const radii = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32, sheet: 36, pill: 999, bubble: 18, bubbleTail: 6 };
export const iconRadius = (size: number) => Math.round(size * 0.2237);

/** Solid lip under tactile surfaces, in points. */
export const lip = { button: 4, pill: 3, card: 5, tile: 4 };

/** CSS-style box shadows (React Native's boxShadow), per scheme. */
export const shadows: Record<Scheme, Record<'avatar' | 'bubble' | 'card' | 'float' | 'thumb' | 'glow', string>> = {
  light: {
    avatar: '0px 8px 20px rgba(28, 25, 23, 0.1)',
    bubble: '0px 1px 0.5px rgba(11, 20, 26, 0.13)',
    card: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 10px 28px rgba(0, 0, 0, 0.06)',
    float: '0px 24px 48px rgba(0, 0, 0, 0.16)',
    thumb: '0px 3px 8px rgba(0, 0, 0, 0.12), 0px 3px 1px rgba(0, 0, 0, 0.04)',
    glow: '0px 0px 18px rgba(79, 152, 248, 0.55)',
  },
  dark: {
    avatar: '0px 8px 20px rgba(0, 0, 0, 0.5)',
    bubble: '0px 1px 0.5px rgba(0, 0, 0, 0.4)',
    card: '0px 10px 28px rgba(0, 0, 0, 0.4)',
    float: '0px 24px 48px rgba(0, 0, 0, 0.6)',
    thumb: '0px 3px 8px rgba(0, 0, 0, 0.3)',
    glow: '0px 0px 20px rgba(79, 152, 248, 0.7)',
  },
};

/** Reanimated spring configs. */
export const springs = {
  /** Finger down: quick and firm. */
  press: { damping: 20, stiffness: 520, mass: 0.6 },
  /** Finger up: a little bounce back. */
  release: { damping: 12, stiffness: 320, mass: 0.7 },
  /** Thumbs and selections sliding into place. */
  snappy: { damping: 22, stiffness: 300, mass: 0.8 },
  /** Sheets rising. */
  sheet: { damping: 26, stiffness: 240, mass: 1 },
  /** Ambient bobbing. */
  gentle: { damping: 14, stiffness: 120, mass: 1 },
};

export const durations = { fast: 140, base: 220, slow: 360, scan: 2800 };
