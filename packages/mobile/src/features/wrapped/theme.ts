import { PixelRatio, type TextStyle } from 'react-native';

import { fonts as ditto } from '@/design/fonts';
import type { SceneName } from '@/design/Backdrop';

/**
 * Wrapped in Ditto's frontpage design: every slide on one of the frontpage's scenes, white type, Spencer for titles and
 * numbers, the navy title shadow, and Ditto pink (#F748B1) as the only colour. The old names stay so the scenes read the
 * same: butter is white, ink is navy, plum and coral are pink, and the rest fold into white.
 */
export const palette = {
  plum: '#F748B1',
  periwinkle: '#FFFFFF',
  butter: '#FFFFFF',
  coral: '#F748B1',
  leaf: '#FFFFFF',
  ink: '#081721',
};

/** No rainbows on the frontpage: pink and white. */
export const rainbow = ['#F748B1', '#FFFFFF', '#F748B1', '#FFFFFF'];
export const rainbowText = ['#FFFFFF', '#FFFFFF'];
export const rainbowRing = ['#F748B1', '#FFFFFF', '#F748B1'];

export interface World {
  deep: string;
  mid: string;
  hot: string;
  glow: string;
  name: string;
  /** The Ditto photographs this chat's slides cycle through, first one first. */
  scenes: SceneName[];
}

/** Every world is the frontpage's navy and section blue with pink; only the order of scenes differs. */
export const worlds: World[] = [
  { deep: '#081721', mid: '#0F2B60', hot: '#F748B1', glow: '#FFFFFF', name: 'dusk', scenes: ['dusk', 'twilight', 'clouds', 'ocean'] },
  { deep: '#081721', mid: '#0F2B60', hot: '#F748B1', glow: '#FFFFFF', name: 'ocean', scenes: ['ocean', 'clouds', 'dusk', 'twilight'] },
  { deep: '#081721', mid: '#0F2B60', hot: '#F748B1', glow: '#FFFFFF', name: 'clouds', scenes: ['clouds', 'twilight', 'ocean', 'dusk'] },
];

/** The photograph behind slide `index` of a chat's story. */
export const sceneFor = (world: World, index: number): SceneName => world.scenes[index % world.scenes.length];

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

/**
 * Ditto's faces in the slots the SwiftUI designs used: Spencer stands in for the serif, compressed and typewriter
 * designs (it has one weight, so callers pass 400), Arial for expanded and rounded, and Spencer for numbers too.
 */
export const fonts = {
  serif: ditto.serif,
  compressed: ditto.serif,
  expanded: ditto.ui,
  mono: ditto.serif,
  rounded: ditto.ui,
  pixel: ditto.pixel,
};

/** The frontpage's navy title shadow, for white type straight on a scene. */
export const lift = { textShadowColor: 'rgba(14, 40, 96, 0.38)', textShadowOffset: { width: 2, height: 4 }, textShadowRadius: 8 } as const;

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
      return { fontFamily: fonts.serif, fontWeight: '400', fontSize: size, lineHeight: size * 1.04, letterSpacing: -0.4, ...lift };
    case 'poster':
      return { fontFamily: fonts.compressed, fontWeight: '400', fontSize: size * 1.08, lineHeight: size * 1.08, letterSpacing: 0.2, textTransform: 'uppercase', ...lift };
    case 'wide':
      return { fontFamily: fonts.serif, fontWeight: '400', fontSize: size * 0.9, lineHeight: size * 0.96, letterSpacing: -0.3, ...lift };
    case 'typewriter':
      return { fontFamily: fonts.mono, fontWeight: '400', fontSize: size * 0.74, lineHeight: size * 0.74 + 8, letterSpacing: -0.2, ...lift };
    case 'rounded':
      return { fontFamily: fonts.rounded, fontWeight: '700', fontSize: size * 0.8, lineHeight: size * 0.9, letterSpacing: -0.6, ...lift };
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
