import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback utilities following Apple HIG
 * Use haptics sparingly for meaningful interactions
 */

// Light tap - for selections, toggles
export function lightTap() {
  if (Platform.OS === 'ios') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

// Medium tap - for button presses, confirmations
export function mediumTap() {
  if (Platform.OS === 'ios') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

// Heavy tap - for significant actions like placing a bid
export function heavyTap() {
  if (Platform.OS === 'ios') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

// Success feedback - for completed actions
export function successFeedback() {
  if (Platform.OS === 'ios') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

// Warning feedback - for alerts, confirmations needed
export function warningFeedback() {
  if (Platform.OS === 'ios') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
}

// Error feedback - for failed actions
export function errorFeedback() {
  if (Platform.OS === 'ios') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

// Selection changed - for picker/scroll selections
export function selectionChanged() {
  if (Platform.OS === 'ios') {
    Haptics.selectionAsync();
  }
}
