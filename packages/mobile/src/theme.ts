/**
 * The older screen theme (ported from Emma's SwiftUI app), remapped onto Ditto's design language: white ink on sky
 * photographs, navy glass for cards, Ditto pink for the accent, Spencer for titles and Arial for text. Every colour
 * stays an rgba() string so withAlpha can re-weight it.
 */
import { fonts } from './design/fonts';

export type Tone = { ink: string; fill: string };

export const Theme = {
  ink: 'rgba(255, 255, 255, 1)',
  secondary: 'rgba(255, 255, 255, 0.72)',
  separator: 'rgba(255, 255, 255, 0.14)',
  tertiaryFill: 'rgba(255, 255, 255, 0.12)',
  secondaryBackground: 'rgba(255, 255, 255, 0.12)',
  /** Cards, bubbles and fields: navy glass. */
  background: 'rgba(8, 23, 33, 0.45)',
  /** Page canvas: transparent, so the screen's photograph shows. */
  paper: 'rgba(8, 23, 33, 0)',
  /** Docked panels and overlays: near-opaque navy (#081721). */
  panel: 'rgba(8, 23, 33, 0.82)',
  /** Solid navy for full overlays that must hide what is under them. */
  solid: 'rgba(8, 23, 33, 1)',
  gridLine: 'rgba(255, 255, 255, 0)',
  gridMajor: 'rgba(255, 255, 255, 0.12)',
  deadline: 'rgba(255, 44, 171, 1)',
  accent: 'rgba(255, 44, 171, 1)',
  accentTone: { ink: 'rgba(255, 123, 203, 1)', fill: 'rgba(255, 44, 171, 0.24)' } as Tone,
  plansTone: { ink: 'rgba(156, 200, 255, 1)', fill: 'rgba(92, 156, 242, 0.26)' } as Tone,
  celebrateTone: { ink: 'rgba(255, 224, 138, 1)', fill: 'rgba(242, 193, 78, 0.24)' } as Tone,
  repliesTone: { ink: 'rgba(201, 184, 255, 1)', fill: 'rgba(159, 135, 245, 0.26)' } as Tone,
  coralTone: { ink: 'rgba(255, 157, 174, 1)', fill: 'rgba(242, 106, 132, 0.24)' } as Tone,
  activitiesTone: { ink: 'rgba(143, 227, 196, 1)', fill: 'rgba(76, 198, 155, 0.24)' } as Tone,
};

export const sectionTone = (section: 'reply' | 'plans' | 'together' | 'memories' | 'gifts'): Tone =>
  section === 'reply' ? Theme.repliesTone : section === 'plans' ? Theme.plansTone : section === 'together' ? Theme.activitiesTone : Theme.coralTone;

/** The same rgba color at another opacity, for washes and highlights. */
export const withAlpha = (color: string, alpha: number) => color.replace(/, [\d.]+\)$/, `, ${alpha})`);

/** Title faces. Both resolve to Spencer, Ditto's serif, which has a single weight. */
export const Rounded = {
  bold: fonts.serif,
  heavy: fonts.serif,
};

const ui = { fontFamily: fonts.ui };

/** Text sizes on Ditto's scale, in the Arial UI stack. */
export const Type = {
  largeTitle: { fontSize: 36, lineHeight: 39, ...ui },
  title: { fontSize: 30, lineHeight: 33, ...ui },
  title2: { fontSize: 24, lineHeight: 28, ...ui },
  title3: { fontSize: 19, lineHeight: 24, ...ui },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: '700' as const, ...ui },
  body: { fontSize: 16, lineHeight: 22, ...ui },
  callout: { fontSize: 15, lineHeight: 21, ...ui },
  subheadline: { fontSize: 14, lineHeight: 19, ...ui },
  footnote: { fontSize: 13, lineHeight: 17, ...ui },
  caption: { fontSize: 12, lineHeight: 15, ...ui },
  caption2: { fontSize: 11, lineHeight: 13, ...ui },
};

/** Ditto's title shadow for white serif on bright sky. */
export const titleShadow = { textShadowColor: 'rgba(0, 0, 0, 0.25)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 4 };

export const radius = { bubble: 20, tile: 16, card: 24, sheet: 32, capsule: 999 };

export const shadow = {
  soft: { shadowColor: '#04121A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  lifted: { shadowColor: '#04121A', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: -3 }, elevation: 6 },
};
