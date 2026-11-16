import { useLocalSearchParams } from 'expo-router';

import { StyleGuide } from '@/design/StyleGuide';

export default function DesignRoute() {
  const { scheme } = useLocalSearchParams<{ scheme?: string }>();
  return <StyleGuide only={scheme === 'light' || scheme === 'dark' ? scheme : undefined} />;
}
