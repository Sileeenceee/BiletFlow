import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocale } from '../lib/i18n'
import { Button, colors, text } from './ui'

type Pending = { title: string; resolve: (value: string | null) => void }

/**
 * Asks for an optional reason before an admin action, like the website's dialog:
 * `ask(title)` resolves with the typed text, or null when cancelled. Render `dialog` once.
 */
export function useReasonDialog(): { dialog: ReactNode; ask: (title: string) => Promise<string | null> } {
  const { t } = useLocale()
  const [pending, setPending] = useState<Pending | null>(null)
  const [value, setValue] = useState('')

  function ask(title: string) {
    setValue('')
    return new Promise<string | null>((resolve) => setPending({ title, resolve }))
  }

  function close(result: string | null) {
    pending?.resolve(result)
    setPending(null)
  }

  const dialog = (
    <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => close(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <Text style={text.heading}>{pending?.title}</Text>
          <Text style={text.label}>{t('reasonDialog.note')}</Text>
          <TextInput autoFocus value={value} onChangeText={setValue} multiline maxLength={500} accessibilityLabel={t('reasonDialog.note')} style={[text.input, styles.input]} />
          <View style={styles.actions}>
            <Button variant="secondary" label={t('common.cancel')} onPress={() => close(null)} style={styles.flex} />
            <Button label={t('common.confirm')} onPress={() => close(value.trim())} style={styles.flex} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
  return { dialog, ask }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, gap: 12 },
  input: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10 },
})
