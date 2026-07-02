import * as Haptics from 'expo-haptics';

// iOS AND Android: expo-haptics maps to UIFeedbackGenerator / Vibrator —
// the primary (Android) user base must get tactile feedback too.
const canVibrate = process.env.EXPO_OS !== 'web';

function safe(fn: () => Promise<void>) {
  if (!canVibrate) return;
  // Never let a haptic failure (old Android, disabled vibrator) surface.
  void fn().catch(() => {});
}

export const haptics = {
  select: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
