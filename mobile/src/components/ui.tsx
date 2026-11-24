import { useState, type ReactNode } from 'react'
import {
  ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type KeyboardTypeOptions, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocale } from '../lib/i18n'

// Palette from the website's Figma design (frontend/src/index.css).
export const colors = {
  brand: '#3d68d8',
  brandDark: '#3254b4',
  brandSoft: '#eef3fe',
  accent: '#fbbf24',
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  surface: '#ffffff',
  background: '#f6f8fb',
  success: '#047857',
  successSoft: '#d1fae5',
  warning: '#92400e',
  warningSoft: '#fef3c7',
  danger: '#be123c',
  dangerSoft: '#ffe4e6',
}

export const text = StyleSheet.create({
  kicker: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 2 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  subheading: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  body: { color: colors.body, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  link: { color: colors.brand, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14,
    fontSize: 16, color: colors.ink, backgroundColor: colors.surface,
  },
})

/** Scrollable page body with pull-to-refresh and the standard padding. */
export function Screen({ children, onRefresh, refreshing = false, padded = true }: {
  children: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  padded?: boolean
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[padded && styles.screenContent]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  )
}

/** Full-screen route body that is not scrollable itself (lists, camera). */
export function Page({ children }: { children: ReactNode }) {
  return <SafeAreaView edges={['bottom']} style={styles.page}>{children}</SafeAreaView>
}

export function Header({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      {kicker ? <Text style={text.kicker}>{kicker}</Text> : null}
      <Text accessibilityRole="header" style={text.title}>{title}</Text>
      {subtitle ? <Text style={[text.muted, styles.headerSubtitle]}>{subtitle}</Text> : null}
    </View>
  )
}

type ButtonProps = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  busy?: boolean
  small?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({ label, onPress, variant = 'primary', disabled, busy, small, style }: ButtonProps) {
  const inactive = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(busy) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, styles[variant], inactive && styles.inactive, pressed && styles.pressed, style]}
    >
      {busy
        ? <ActivityIndicator color={variant === 'primary' ? '#ffffff' : colors.brand} />
        : <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: buttonColor[variant] }]}>{label}</Text>}
    </Pressable>
  )
}

const buttonColor = { primary: '#ffffff', secondary: colors.ink, danger: colors.danger, ghost: colors.brand }

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function ErrorText({ message }: { message: string }) {
  if (!message) return null
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.notice, styles.error]}>{message}</Text>
}

export function Notice({ message, tone = 'success' }: { message: string; tone?: 'success' | 'warning' | 'info' }) {
  if (!message) return null
  const toneStyle = tone === 'success' ? styles.success : tone === 'warning' ? styles.warning : styles.info
  return <Text accessibilityLiveRegion="polite" style={[styles.notice, toneStyle]}>{message}</Text>
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.brand} />
      {label ? <Text style={text.muted}>{label}</Text> : null}
    </View>
  )
}

export function Empty({ title, text: body }: { title: string; text?: string }) {
  return (
    <Card style={styles.empty}>
      <Text style={text.subheading}>{title}</Text>
      {body ? <Text style={[text.muted, styles.emptyText]}>{body}</Text> : null}
    </Card>
  )
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }) {
  const palette = {
    neutral: ['#f1f5f9', colors.muted], success: [colors.successSoft, colors.success], warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger], brand: [colors.brandSoft, colors.brand],
  }[tone]
  return <Text style={[styles.badge, { backgroundColor: palette[0], color: palette[1] }]}>{label}</Text>
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={text.muted}>{hint}</Text> : null}
    </Card>
  )
}

/** A label/value line inside a card. */
export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[text.muted, styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[text.body, styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  )
}

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string
  error?: string
  hint?: string
  multiline?: boolean
  keyboardType?: KeyboardTypeOptions
}

export function Field({ label, error, hint, multiline, ...input }: FieldProps) {
  return (
    <View>
      <Text style={text.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[text.input, multiline && styles.multiline, error ? styles.inputError : null]}
        {...input}
      />
      {hint ? <Text style={[text.muted, styles.hint]}>{hint}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}
    </View>
  )
}

export type Option = { value: string; label: string }

/** Dropdown replacement: a field that opens a list of options in a sheet. */
export function Select({ label, value, options, onChange, placeholder }: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const current = options.find((option) => option.value === value)
  return (
    <View>
      <Text style={text.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? ''}`} onPress={() => setOpen(true)} style={[text.input, styles.select]}>
        <Text style={[text.body, !current && { color: colors.muted }]} numberOfLines={1}>{current?.label ?? placeholder ?? t('mobile.choose')}</Text>
        <Text style={text.muted}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('common.cancel')}>
          <View style={styles.sheet}>
            <Text style={[text.heading, styles.sheetTitle]}>{label}</Text>
            <ScrollView style={styles.sheetList}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: option.value === value }}
                  onPress={() => { onChange(option.value); setOpen(false) }}
                  style={[styles.option, option.value === value && styles.optionSelected]}
                >
                  <Text style={[text.body, option.value === value && styles.optionSelectedText]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

/** Horizontal tab strip used for in-page sections (Manage event, Admin, filters). */
export function Segmented<T extends string>({ items, value, onChange, label }: {
  items: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label} contentContainerStyle={styles.segmented}>
      {items.map((item) => (
        <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: item.value === value }} onPress={() => onChange(item.value)} style={[styles.segment, item.value === value && styles.segmentActive]}>
          <Text style={[styles.segmentText, item.value === value && styles.segmentTextActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggle}>
      <Text style={[text.body, styles.flex]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand, false: colors.line }} />
    </Pressable>
  )
}

export function Divider() {
  return <View style={styles.divider} />
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: 16, gap: 14, paddingBottom: 40 },
  page: { flex: 1, backgroundColor: colors.background },
  header: { gap: 2, marginBottom: 2 },
  headerSubtitle: { marginTop: 4, fontSize: 14 },
  button: { minHeight: 48, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { minHeight: 36, borderRadius: 10, paddingHorizontal: 12 },
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#fecdd3' },
  ghost: { backgroundColor: 'transparent' },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextSmall: { fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 },
  notice: { borderRadius: 12, padding: 12, fontSize: 14, overflow: 'hidden' },
  error: { backgroundColor: colors.dangerSoft, color: colors.danger },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  info: { backgroundColor: colors.brandSoft, color: colors.brandDark },
  loading: { padding: 32, alignItems: 'center', gap: 10 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyText: { textAlign: 'center', marginTop: 4 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  stat: { flexGrow: 1, flexBasis: '45%', gap: 2 },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flexShrink: 1 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  strong: { fontWeight: '800', color: colors.ink },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  hint: { marginTop: 6 },
  fieldError: { color: colors.danger, fontSize: 13, marginTop: 6 },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, maxHeight: '70%' },
  sheetTitle: { padding: 16, paddingBottom: 8 },
  sheetList: { paddingHorizontal: 8 },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
  optionSelected: { backgroundColor: colors.brandSoft },
  optionSelectedText: { color: colors.brand, fontWeight: '700' },
  segmented: { gap: 6, padding: 4, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  segment: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  segmentTextActive: { color: '#ffffff' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
})
