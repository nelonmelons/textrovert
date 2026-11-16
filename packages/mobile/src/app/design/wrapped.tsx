import { useLocalSearchParams } from 'expo-router';

import { SchemeProvider } from '@/design';
import { wrappedSlides, type WrappedSlideName } from '@/design/mockups/Wrapped';

/** /design/wrapped?slide=opener|guess|ghost|finale&scheme=light|dark */
export default function WrappedDesignRoute() {
  const { slide, scheme } = useLocalSearchParams<{ slide?: string; scheme?: string }>();
  const Slide = wrappedSlides[(slide && slide in wrappedSlides ? slide : 'opener') as WrappedSlideName];
  return scheme === 'light' || scheme === 'dark' ? (
    <SchemeProvider scheme={scheme}>
      <Slide />
    </SchemeProvider>
  ) : (
    <Slide />
  );
}
