import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { forgotPassword } from '../api/auth'
import { Button, Card, ErrorText, Field, Header, Notice, Screen } from '../components/ui'
import { errorMessage, isEmail } from '../lib/format'
import { useLocale } from '../lib/i18n'

export default function ForgotPassword() {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [devToken, setDevToken] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const invalid = !email.trim() ? t('auth.required') : !isEmail(email) ? t('auth.invalidEmail') : ''
    setFieldError(invalid)
    setError('')
    if (invalid) return
    setBusy(true)
    try {
      const res = await forgotPassword(email.trim())
      setDevToken(res.resetToken ?? '')
      setSent(true)
    } catch (err) {
      setError(errorMessage(err, t('auth.genericError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Header title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')} />
      <Card style={styles.form}>
        {sent ? (
          <>
            <Notice message={`${t('auth.linkSent')}. ${t('auth.checkInbox')}`} />
            {devToken ? <Notice tone="warning" message={t('auth.devLink')} /> : null}
            <Button label={t('auth.resetTitle')} onPress={() => router.push({ pathname: '/reset-password', params: devToken ? { token: devToken } : {} })} />
          </>
        ) : (
          <>
            <Field label={t('auth.email')} value={email} onChangeText={setEmail} error={fieldError} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
            <ErrorText message={error} />
            <Button label={busy ? t('auth.sending') : t('auth.sendLink')} busy={busy} onPress={() => void submit()} />
          </>
        )}
        <Button label={t('auth.backToLogin')} variant="ghost" onPress={() => router.replace('/login')} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({ form: { gap: 14 } })
