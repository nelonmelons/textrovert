/**
 * The older screen theme (ported from Emma's SwiftUI app), remapped onto Ditto's frontpage: white ink on the scenes,
 * house glass for cards, pink only as the accent, Spencer for titles and Arial for text. Every colour
 * stays an rgba() string so withAlpha can re-weight it.
 */
import { fonts } from './design/fonts';

export type Tone = { ink: string; fill: string };

export const Theme = {
  ink: 'rgba(255, 255, 255, 1)',
  secondary: 'rgba(255, 255, 255, 0.8)',
  separator: 'rgba(255, 255, 255, 0.1)',
  tertiaryFill: 'rgba(255, 255, 255, 0.1)',
  secondaryBackground: 'rgba(255, 255, 255, 0.1)',
  /** Cards and panels: the frontpage's house glass (#011E2C at 40%). */
  background: 'rgba(8, 23, 33, 0.34)',
  /** Page canvas: transparent, so the screen's scene shows. */
  paper: 'rgba(8, 23, 33, 0)',
  panel: 'rgba(1, 30, 44, 0.9)',
  solid: 'rgba(8, 23, 33, 1)',
  gridLine: 'rgba(255, 255, 255, 0)',
  gridMajor: 'rgba(255, 255, 255, 0.1)',
  /** Pink, for the one urgent thing. */
  deadline: 'rgba(247, 72, 177, 1)',
  accent: 'rgba(247, 72, 177, 1)',
  /** Section tones collapse to the frontpage's white-on-glass; only the accent keeps its pink. */
  accentTone: { ink: 'rgba(247, 72, 177, 1)', fill: 'rgba(247, 72, 177, 0.2)' } as Tone,
  plansTone: { ink: 'rgba(255, 255, 255, 0.8)', fill: 'rgba(255, 255, 255, 0.1)' } as Tone,
  celebrateTone: { ink: 'rgba(255, 255, 255, 0.8)', fill: 'rgba(255, 255, 255, 0.1)' } as Tone,
  repliesTone: { ink: 'rgba(255, 255, 255, 0.8)', fill: 'rgba(255, 255, 255, 0.1)' } as Tone,
  coralTone: { ink: 'rgba(255, 255, 255, 0.8)', fill: 'rgba(255, 255, 255, 0.1)' } as Tone,
  activitiesTone: { ink: 'rgba(255, 255, 255, 0.8)', fill: 'rgba(255, 255, 255, 0.1)' } as Tone,
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

/** The frontpage's navy title shadow. */
export const titleShadow = { textShadowColor: 'rgba(14, 40, 96, 0.38)', textShadowOffset: { width: 2, height: 4 }, textShadowRadius: 8 };

export const radius = { bubble: 20, tile: 16, card: 24, sheet: 32, capsule: 999 };

export const shadow = {
  soft: { shadowColor: '#04121A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  lifted: { shadowColor: '#04121A', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: -3 }, elevation: 6 },
};
