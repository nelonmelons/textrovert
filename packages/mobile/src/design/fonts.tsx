import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito';

/**
 * Ditto's frontpage faces (dodo-world/ditto apps/frontpage): Spencer for titles and big numbers, Bitter Sour for the
 * hand-lettered accent, SF for Messages, and the Arial-first UI stack for everything else. Arial leads on purpose, as in Ditto's --font-ui: a Helvetica-first stack
 * can resolve to an oblique-only face on some machines.
 */
export const fontFiles = {
  Spencer: require('../../assets/fonts/Spencer-Regular.ttf'),
  BitterSour: require('../../assets/fonts/BitterSour-Regular.ttf'),
  Nunito_800ExtraBold,
};

export const fonts = {
  serif: 'Spencer',
  /** No pixel face on the frontpage: big numbers are Spencer. Kept for older call sites. */
  pixel: 'Spencer',
  /** Messages' face, for chat bubbles and contact headers. */
  sf: Platform.select({ web: '-apple-system, "SF Pro Text", system-ui, sans-serif', ios: undefined, default: 'sans-serif' }) as string | undefined,
  /** The frontpage's hand-lettered accent ("@Austin", "Date without Swiping"). */
  script: 'BitterSour',
  /** The wordmark: a rounded heavy sans, like Ditto's. */
  wordmark: 'Nunito_800ExtraBold',
  ui: Platform.select({ web: 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif', ios: 'Arial', default: 'sans-serif' }) as string,
};

/** Kept for older call sites: every weight is the UI face now, with the weight carried by fontWeight. */
export const geist = { '400': fonts.ui, '500': fonts.ui, '600': fonts.ui, '700': fonts.ui, '800': fonts.ui } as const;
export type Weight = keyof typeof geist;
export const geistFor = (_weight?: string | number) => fonts.ui;

export function useDittoFonts() {
  const [loaded, error] = useFonts(fontFiles);
  return loaded || !!error;
}

/** Loads Ditto's faces and renders children once they are ready (or failed, falling back to the system face). */
export function DesignFonts({ children }: { children: ReactNode }) {
  return useDittoFonts() ? <>{children}</> : null;
}
