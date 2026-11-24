import { Alert, Platform } from 'react-native'

/**
 * Asks before a destructive action. React Native's Alert has no buttons in the
 * web preview, so the browser's own dialog is used there.
 */
export function confirmAction(title: string, message: string, confirmLabel: string, cancelLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm()
    return
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ])
}
