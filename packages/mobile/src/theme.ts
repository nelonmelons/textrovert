import { Platform, useColorScheme, type TextStyle } from 'react-native';

/**
 * Textrovert's design tokens, ported from the SwiftUI app's Theme and Paper.swift so screens ported from it keep
 * the same paper, ink, section tones and type hierarchy. Colors use the Swift component values (0...1) on purpose,
 * so they can be diffed against the original.
 */
const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

/** The same color at another opacity, for washes and highlights. */
export const alpha = (color: string, a: number) => color.replace(/, [\d.]+\)$/, `, ${a})`);

type Scheme = 'light' | 'dark';
type Pair = Record<Scheme, string>;
const pair = (light: string, dark: string): Pair => ({ light, dark });

export interface Tone {
  ink: string;
  fill: string;
}
const tone = (ink: Pair, fill: Pair) => ({ ink, fill });

const tones = {
  accent: tone(pair(rgb(0.659, 0.306, 0.345), rgb(0.9, 0.6, 0.64)), pair(rgb(0.957, 0.89, 0.886), rgb(0.3, 0.17, 0.19))),
  plans: tone(pair(rgb(0.24, 0.37, 0.55), rgb(0.66, 0.78, 0.93)), pair(rgb(0.827, 0.878, 0.941), rgb(0.16, 0.21, 0.29))),
  celebrate: tone(pair(rgb(0.54, 0.35, 0.04), rgb(0.96, 0.8, 0.45)), pair(rgb(0.969, 0.875, 0.659), rgb(0.32, 0.25, 0.1))),
  replies: tone(pair(rgb(0.42, 0.3, 0.55), rgb(0.8, 0.7, 0.93)), pair(rgb(0.89, 0.843, 0.933), rgb(0.24, 0.19, 0.31))),
  coral: tone(pair(rgb(0.64, 0.29, 0.16), rgb(0.98, 0.7, 0.58)), pair(rgb(0.973, 0.824, 0.753), rgb(0.34, 0.2, 0.15))),
  activities: tone(pair(rgb(0.29, 0.42, 0.18), rgb(0.72, 0.84, 0.6)), pair(rgb(0.839, 0.898, 0.765), rgb(0.18, 0.25, 0.14))),
};

const surfaces = {
  paper: pair(rgb(0.961, 0.941, 0.902), rgb(0.129, 0.114, 0.133)),
  panel: pair(rgb(1, 0.992, 0.976), rgb(0.18, 0.16, 0.18)),
  gridLine: pair(rgb(0.45, 0.36, 0.3, 0.08), rgb(1, 0.92, 0.85, 0.05)),
  gridMajor: pair(rgb(0.45, 0.36, 0.3, 0.13), rgb(1, 0.92, 0.85, 0.08)),
  ink: pair(rgb(0.153, 0.137, 0.129), rgb(0.95, 0.93, 0.9)),
  /** UIKit's secondaryLabel, systemBackground, secondarySystemBackground and tertiarySystemFill. */
  secondary: pair('rgba(60, 60, 67, 0.6)', 'rgba(235, 235, 245, 0.6)'),
  surface: pair('#FFFFFF', '#1C1C1E'),
  surfaceSecondary: pair('#F2F2F7', '#2C2C2E'),
  fillTertiary: pair('rgba(118, 118, 128, 0.12)', 'rgba(118, 118, 128, 0.24)'),
};

/** Fixed brand colors, the same in light and dark. */
export const brand = {
  purple: rgb(0.51, 0.23, 0.71),
  magenta: rgb(0.76, 0.21, 0.52),
  pink: rgb(0.88, 0.19, 0.42),
  orange: rgb(0.97, 0.47, 0.22),
  gold: rgb(0.99, 0.69, 0.27),
  deadline: rgb(0.74, 0.29, 0),
};

function palette(scheme: Scheme) {
  const t = Object.fromEntries(Object.entries(tones).map(([k, v]) => [k, { ink: v.ink[scheme], fill: v.fill[scheme] }])) as Record<keyof typeof tones, Tone>;
  const s = Object.fromEntries(Object.entries(surfaces).map(([k, v]) => [k, v[scheme]])) as Record<keyof typeof surfaces, string>;
  return {
    scheme,
    ...s,
    tones: t,
    /** Section colors, as in the Swift Theme. */
    accent: t.accent.ink,
    plans: t.plans.ink,
    activities: t.activities.ink,
    gifts: t.coral.ink,
    replies: t.replies.ink,
    /** Ask is the purple section. */
    ask: t.replies,
  };
}

export type Theme = ReturnType<typeof palette>;
const themes: Record<Scheme, Theme> = { light: palette('light'), dark: palette('dark') };

export function useTheme(): Theme {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

/** SwiftUI's .rounded design for titles; the default system face for everything else. */
const rounded = Platform.select({ web: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, sans-serif', default: undefined });
const system = Platform.select({ web: 'system-ui, -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif', default: undefined });

/** iOS Dynamic Type sizes at the default setting. */
export const type = {
  largeTitle: { fontFamily: rounded, fontSize: 34, lineHeight: 41, fontWeight: '800' },
  title: { fontFamily: rounded, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontFamily: rounded, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontFamily: rounded, fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontFamily: system, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontFamily: system, fontSize: 17, lineHeight: 23 },
  callout: { fontFamily: system, fontSize: 16, lineHeight: 21 },
  subheadline: { fontFamily: system, fontSize: 15, lineHeight: 20 },
  footnote: { fontFamily: system, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: system, fontSize: 12, lineHeight: 16 },
  caption2: { fontFamily: system, fontSize: 11, lineHeight: 13 },
} satisfies Record<string, TextStyle>;

export const radius = { bubble: 18, bubbleTail: 4, card: 22, tile: 14, sheet: 24, capsule: 999 };

/** Notebook grid: a minor line every cell, a major line every fourth. */
export const grid = { cell: 22, majorEvery: 4 };

export const shadow = {
  soft: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  lifted: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 6 },
};
