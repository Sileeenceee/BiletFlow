import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { formatDate, formatDateTime } from '../lib/format'
import { useLocale } from '../lib/i18n'
import { colors, text } from './ui'

type Props = {
  label: string
  /** ISO 8601 instant, or '' when empty. */
  value: string
  onChange: (value: string) => void
  /** 'date' fields hold yyyy-mm-dd (filters); 'datetime' fields hold an ISO instant. */
  mode?: 'date' | 'datetime'
  optional?: boolean
  error?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (date: Date, mode: 'date' | 'datetime') =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
  (mode === 'datetime' ? ` ${pad(date.getHours())}:${pad(date.getMinutes())}` : '')

/**
 * Date or date-and-time field: the platform picker on Android and iOS, a typed
 * "yyyy-mm-dd hh:mm" value in the web preview where no native picker exists.
 */
export function DateField({ label, value, onChange, mode = 'datetime', optional, error }: Props) {
  const { t } = useLocale()
  const [iosOpen, setIosOpen] = useState(false)
  const current = value ? new Date(mode === 'date' ? `${value}T00:00:00` : value) : null
  const emit = (date: Date) => onChange(mode === 'date' ? toLocalInput(date, 'date') : date.toISOString())

  function openAndroid() {
    const start = current ?? new Date()
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== 'set' || !picked) return
        if (mode === 'date') return emit(picked)
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent: DateTimePickerEvent, time?: Date) => {
            if (timeEvent.type === 'set' && time) emit(time)
          },
        })
      },
    })
  }

  if (Platform.OS === 'web') {
    return <WebDateInput label={label} value={value} mode={mode} onChange={onChange} error={error} />
  }

  const shown = current ? (mode === 'date' ? formatDate(current.toISOString()) : formatDateTime(current.toISOString())) : t('mobile.notSet')
  return (
    <View>
      <Text style={text.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${shown}`}
          onPress={() => (Platform.OS === 'android' ? openAndroid() : setIosOpen((open) => !open))}
          style={[text.input, styles.value, error ? styles.invalid : null]}
        >
          <Text style={[text.body, !current && { color: colors.muted }]}>{shown}</Text>
        </Pressable>
        {optional && current && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('mobile.clear')} onPress={() => onChange('')} style={styles.clear}>
            <Text style={text.link}>{t('mobile.clear')}</Text>
          </Pressable>
        )}
      </View>
      {iosOpen && (
        <DateTimePicker
          value={current ?? new Date()}
          mode={mode}
          display="inline"
          onChange={(_: DateTimePickerEvent, picked?: Date) => { if (picked) emit(picked) }}
        />
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  )
}

function WebDateInput({ label, value, mode, onChange, error }: Omit<Props, 'optional'> & { mode: 'date' | 'datetime' }) {
  const initial = value ? (mode === 'date' ? value : toLocalInput(new Date(value), 'datetime')) : ''
  const [draft, setDraft] = useState(initial)
  const pattern = mode === 'date' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/

  function change(next: string) {
    setDraft(next)
    if (!next.trim()) return onChange('')
    if (!pattern.test(next.trim())) return
    if (mode === 'date') return onChange(next.trim())
    const date = new Date(next.trim().replace(' ', 'T'))
    if (!Number.isNaN(date.getTime())) onChange(date.toISOString())
  }

  return (
    <View>
      <Text style={text.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={draft}
        onChangeText={change}
        placeholder={mode === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm'}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={[text.input, error ? styles.invalid : null]}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { flex: 1, justifyContent: 'center' },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  invalid: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13, marginTop: 6 },
})
