import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

/** Light taps for sending and opening sources; nothing on web. */
export const haptics = {
  send: () => native && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  select: () => native && void Haptics.selectionAsync().catch(() => {}),
  impact: (style: 'light' | 'medium') =>
    native && void Haptics.impactAsync(style === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
};
