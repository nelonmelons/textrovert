import { PixelRatio, Platform, type TextStyle } from 'react-native';

/** Wrapped's art direction (WrappedTheme.swift): Emma's anchors, the rainbow for big moments only, one world per chat. */
export const palette = {
  plum: '#6843A5',
  periwinkle: '#DCE5FF',
  butter: '#FFF0CE',
  coral: '#F6B3A6',
  leaf: '#B9D9A6',
  ink: '#29252D',
};

export const rainbow = [palette.plum, '#C8479B', palette.coral, palette.butter, palette.leaf, palette.periwinkle];
/** For text on the dark scenes: starts light so every letter keeps contrast. */
export const rainbowText = ['#F2A6D8', palette.coral, palette.butter, palette.leaf, palette.periwinkle];
export const rainbowRing = [...rainbow, palette.plum];

export interface World {
  deep: string;
  mid: string;
  hot: string;
  glow: string;
  name: string;
}

export const worlds: World[] = [
  { deep: '#1D1030', mid: palette.plum, hot: palette.coral, glow: palette.butter, name: 'plum' },
  { deep: '#15231A', mid: '#3F6B47', hot: palette.leaf, glow: palette.periwinkle, name: 'leaf' },
  { deep: '#151B3D', mid: '#4658B8', hot: palette.periwinkle, glow: palette.coral, name: 'periwinkle' },
];

/** FNV-1a over the conversation id's UTF-8 bytes, as in Swift, so a chat keeps its world on every platform. */
export function worldFor(conversationId: string): World {
  let h = 2166136261;
  for (const b of new TextEncoder().encode(conversationId)) h = Math.imul(h ^ b, 16777619) >>> 0;
  return worlds[h % worlds.length];
}

/** '#RRGGBB' at an opacity. */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Linear blend of two '#RRGGBB' colors. */
export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return '#' + [16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('');
}

const web = Platform.OS === 'web';
/** System families that stand in for SwiftUI's serif, compressed, expanded, monospaced and rounded designs. */
export const fonts = {
  serif: web ? 'ui-serif, "New York", Georgia, serif' : Platform.OS === 'ios' ? 'Georgia' : 'serif',
  compressed: web ? '"SF Compact", "Avenir Next Condensed", "Arial Narrow", Impact, sans-serif' : Platform.OS === 'ios' ? 'AvenirNextCondensed-Heavy' : 'sans-serif-condensed',
  expanded: web ? 'system-ui, -apple-system, "Helvetica Neue", sans-serif' : undefined,
  mono: web ? 'ui-monospace, Menlo, monospace' : Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  rounded: web ? 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' : undefined,
};

export type DisplayType = 'serifItalic' | 'poster' | 'wide' | 'typewriter' | 'rounded';

/** Base 54 scaled with the system text size, then by length: ≤22 ×1.2, ≤44 ×0.86, ≤80 ×0.64, else ×0.5. */
export function displaySize(text: string): number {
  const base = 54 * Math.min(PixelRatio.getFontScale(), 1.6);
  const n = [...text].length;
  return base * (n <= 22 ? 1.2 : n <= 44 ? 0.86 : n <= 80 ? 0.64 : 0.5);
}

export function displayStyle(type: DisplayType, size: number): TextStyle {
  switch (type) {
    case 'serifItalic':
      return { fontFamily: fonts.serif, fontWeight: '900', fontStyle: 'italic', fontSize: size, lineHeight: size * 1.02, letterSpacing: -0.8 };
    case 'poster':
      return { fontFamily: fonts.compressed, fontWeight: '900', fontSize: size * 1.08, lineHeight: size * 1.08, letterSpacing: 0.5, textTransform: 'uppercase' };
    case 'wide':
      return { fontFamily: fonts.expanded, fontWeight: '800', fontSize: size * 0.82, lineHeight: size * 0.9, letterSpacing: -0.5 };
    case 'typewriter':
      return { fontFamily: fonts.mono, fontWeight: '700', fontSize: size * 0.66, lineHeight: size * 0.66 + 10, letterSpacing: -0.4 };
    case 'rounded':
      return { fontFamily: fonts.rounded, fontWeight: '800', fontSize: size * 0.92, lineHeight: size * 0.98, letterSpacing: -0.8 };
  }
}

/** Sizes of the iOS text styles the Swift scenes use, before Dynamic Type. */
export const text = {
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },
  footnote: { fontSize: 13, lineHeight: 18 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  body: { fontSize: 17, lineHeight: 22 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title3: { fontSize: 20, lineHeight: 25 },
  title2: { fontSize: 22, lineHeight: 28 },
} satisfies Record<string, TextStyle>;
