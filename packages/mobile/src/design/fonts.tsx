import type { ReactNode } from 'react';
import { useFonts } from 'expo-font';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { Geist_800ExtraBold } from '@expo-google-fonts/geist/800ExtraBold';

/** Geist faces by weight. Each weight is its own family, so text picks a face instead of synthesising bold. */
export const geist = {
  '400': 'Geist_400Regular',
  '500': 'Geist_500Medium',
  '600': 'Geist_600SemiBold',
  '700': 'Geist_700Bold',
  '800': 'Geist_800ExtraBold',
} as const;

export type Weight = keyof typeof geist;

/** The face for a fontWeight, rounding to the nearest loaded weight. */
export function geistFor(weight: string | number | undefined): string {
  const n = weight === 'bold' ? 700 : Number(weight) || 400;
  const w = Math.min(800, Math.max(400, Math.round(n / 100) * 100));
  return geist[String(w) as Weight];
}

/** Loads Geist and renders children once it is ready (or failed, falling back to the system face). */
export function DesignFonts({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, Geist_800ExtraBold });
  return loaded || error ? <>{children}</> : null;
}
