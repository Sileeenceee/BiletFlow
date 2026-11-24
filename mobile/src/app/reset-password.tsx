import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { resetPassword } from '../api/auth'
import { Button, Card, ErrorText, Field, Header, Notice, Screen } from '../components/ui'
import { errorMessage } from '../lib/format'
import { useLocale } from '../lib/i18n'

export default function ResetPassword() {
  const { t } = useLocale()
  const params = useLocalSearchParams<{ token?: string }>()
  const [token, setToken] = useState(params.token ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const next = {
      token: token.trim() ? undefined : t('auth.resetNoToken'),
      password: password.length < 8 ? t('auth.min8') : undefined,
      confirm: !confirm ? t('auth.required') : confirm !== password ? t('auth.mismatch') : undefined,
    }
    setErrors(next)
    setError('')
    if (Object.values(next).some(Boolean)) return
    setBusy(true)
    try {
      await resetPassword(token.trim(), password)
      setDone(true)
      setTimeout(() => router.replace('/login'), 1500)
    } catch (err) {
      setError(errorMessage(err, t('auth.genericError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Header title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')} />
      <Card style={styles.form}>
        {done ? <Notice message={t('auth.resetDone')} /> : (
          <>
            {!params.token && <Field label={t('mobile.tokenLabel')} hint={t('mobile.tokenHint')} value={token} onChangeText={setToken} error={errors.token} autoCapitalize="none" autoCorrect={false} />}
            <Field label={t('auth.newPassword')} value={password} onChangeText={setPassword} error={errors.password} secureTextEntry autoComplete="new-password" />
            <Field label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} error={errors.confirm} secureTextEntry autoComplete="new-password" />
            <ErrorText message={error} />
            <Button label={busy ? t('auth.saving') : t('auth.saveButton')} busy={busy} onPress={() => void submit()} />
            <Button label={t('auth.requestNew')} variant="ghost" onPress={() => router.replace('/forgot-password')} />
          </>
        )}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({ form: { gap: 14 } })
