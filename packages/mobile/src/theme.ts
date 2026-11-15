const rgb = (r: number, g: number, b: number, a = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

export type Tone = { ink: string; fill: string };

export const Theme = {
  ink: rgb(0.153, 0.137, 0.129),
  secondary: 'rgba(60, 60, 67, 0.6)',
  separator: 'rgba(60, 60, 67, 0.29)',
  tertiaryFill: 'rgba(118, 118, 128, 0.12)',
  secondaryBackground: '#F2F2F7',
  background: '#FFFFFF',
  paper: rgb(0.961, 0.941, 0.902),
  panel: rgb(1.0, 0.992, 0.976),
  gridLine: rgb(0.45, 0.36, 0.3, 0.08),
  gridMajor: rgb(0.45, 0.36, 0.3, 0.13),
  deadline: rgb(0.74, 0.29, 0.0),
  accentTone: { ink: rgb(0.659, 0.306, 0.345), fill: rgb(0.957, 0.89, 0.886) } as Tone,
  plansTone: { ink: rgb(0.24, 0.37, 0.55), fill: rgb(0.827, 0.878, 0.941) } as Tone,
  celebrateTone: { ink: rgb(0.54, 0.35, 0.04), fill: rgb(0.969, 0.875, 0.659) } as Tone,
  repliesTone: { ink: rgb(0.42, 0.3, 0.55), fill: rgb(0.89, 0.843, 0.933) } as Tone,
  coralTone: { ink: rgb(0.64, 0.29, 0.16), fill: rgb(0.973, 0.824, 0.753) } as Tone,
  activitiesTone: { ink: rgb(0.29, 0.42, 0.18), fill: rgb(0.839, 0.898, 0.765) } as Tone,
  get accent() {
    return this.accentTone.ink;
  },
};

export const withAlpha = (color: string, alpha: number) => color.replace(/, [\d.]+\)$/, `, ${alpha})`);

export const Rounded = {
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
};

export const Type = {
  largeTitle: { fontSize: 34, lineHeight: 41 },
  title2: { fontSize: 22, lineHeight: 28 },
  title3: { fontSize: 20, lineHeight: 25 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
};
