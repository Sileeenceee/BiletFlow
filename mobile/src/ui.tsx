import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

// Same palette as the web app (Tailwind indigo / slate / emerald / amber / rose).
export const colors = {
  brand: '#4f46e5',
  brandDark: '#3730a3',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  surface: '#ffffff',
  background: '#f8fafc',
  success: '#047857',
  successSoft: '#d1fae5',
  warning: '#92400e',
  warningSoft: '#fef3c7',
  danger: '#be123c',
  dangerSoft: '#ffe4e6',
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

type ButtonProps = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  busy?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({ label, onPress, variant = 'primary', disabled, busy, style }: ButtonProps) {
  const inactive = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(busy) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], inactive && styles.inactive, pressed && styles.pressed, style]}
    >
      {busy
        ? <ActivityIndicator color={variant === 'primary' ? '#ffffff' : colors.brand} />
        : <Text style={[styles.buttonText, variant !== 'primary' && { color: variant === 'danger' ? colors.danger : colors.ink }]}>{label}</Text>}
    </Pressable>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function ErrorText({ message }: { message: string }) {
  if (!message) return null
  return <Text accessibilityRole="alert" style={styles.error}>{message}</Text>
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#fecdd3' },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16 },
  error: { backgroundColor: colors.dangerSoft, color: colors.danger, borderRadius: 12, padding: 12, fontSize: 14 },
})

export const text = StyleSheet.create({
  kicker: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 2 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14,
    fontSize: 16, color: colors.ink, backgroundColor: colors.surface,
  },
})
