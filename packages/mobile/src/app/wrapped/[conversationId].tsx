import { useLocalSearchParams } from 'expo-router';

import { WrappedScreen } from '@/features/wrapped/WrappedScreen';

/** /wrapped/<conversationId>?from=YYYY-MM-DD&through=YYYY-MM-DD, presented full screen. */
export default function WrappedRoute() {
  const { conversationId, from, through } = useLocalSearchParams<{ conversationId: string; from?: string; through?: string }>();
  return <WrappedScreen conversationId={conversationId} from={from} through={through} />;
}
