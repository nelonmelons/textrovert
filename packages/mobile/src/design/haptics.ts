import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

/** Taps for the design system's controls; silent on web. */
export const haptics = {
  tap: () => native && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  thud: () => native && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  select: () => native && void Haptics.selectionAsync().catch(() => {}),
  success: () => native && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};
