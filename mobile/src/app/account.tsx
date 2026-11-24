import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { deleteAccount, resendVerification, updateAccount } from '../api/auth'
import { Button, Card, ErrorText, Field, Header, Notice, Screen, colors, text } from '../components/ui'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'
import { errorMessage } from '../lib/format'
import { useLocale } from '../lib/i18n'

/** Account settings: email, password, verification email and account deletion (SRS 4.1). */
export default function Account() {
  const { user, updateUser, signOut } = useAuth()
  const { t } = useLocale()
  const [email, setEmail] = useState(user?.email ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [devToken, setDevToken] = useState('')

  if (!user) return null

  async function save() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const saved = await updateAccount({
        currentPassword,
        email: email.trim() !== user!.email ? email.trim() : undefined,
        newPassword: newPassword || undefined,
      })
      updateUser({ email: saved.email, emailConfirmed: saved.emailConfirmed })
      setDevToken(saved.verificationToken ?? '')
      setMessage(saved.emailConfirmed ? t('account.updated') : t('account.updatedVerify'))
      setNewPassword('')
      setCurrentPassword('')
    } catch (err) {
      setError(errorMessage(err, t('account.updateError')))
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError('')
    setMessage('')
    try {
      const result = await resendVerification(user!.email)
      setDevToken(result.verificationToken ?? '')
      setMessage(result.message)
    } catch (err) {
      setError(errorMessage(err, t('account.resendError')))
    }
  }

  async function remove() {
    try {
      await deleteAccount()
      signOut()
      router.replace('/')
    } catch (err) {
      setError(errorMessage(err, t('account.deleteError')))
    }
  }

  function confirmDelete() {
    confirmAction(t('account.deleteTitle'), t('account.deleteText'), t('account.deleteConfirm'), t('account.keep'), () => void remove())
  }

  return (
    <Screen>
      <Header kicker={t('account.kicker')} title={t('account.title')} subtitle={`${user.email} · ${t(`role.${user.role}`)}`} />
      <ErrorText message={error} />
      <Notice message={message} />
      {devToken ? (
        <Card style={styles.gap}>
          <Notice tone="warning" message={t('account.devOnly')} />
          <Button label={t('account.devLink')} variant="secondary" onPress={() => router.push({ pathname: '/verify-email', params: { token: devToken } })} />
        </Card>
      ) : null}

      {!user.emailConfirmed && (
        <Card style={[styles.gap, styles.warning]}>
          <Text style={text.subheading}>{t('account.unverifiedTitle')}</Text>
          <Text style={text.body}>{t('account.unverifiedText')}</Text>
          <Button label={t('account.resend')} variant="secondary" onPress={() => void resend()} />
          <Button label={t('auth.verifyLink')} variant="ghost" onPress={() => router.push('/verify-email')} />
        </Card>
      )}

      <Card style={styles.gap}>
        <Text style={text.heading}>{t('account.credentials')}</Text>
        <Field label={t('form.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={320} />
        <Field label={t('account.newPassword')} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" />
        <Field label={t('account.currentPassword')} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" />
        <Button label={busy ? t('reset.submitting') : t('account.save')} busy={busy} disabled={!currentPassword} onPress={() => void save()} />
      </Card>

      <Card style={[styles.gap, styles.danger]}>
        <Text style={[text.heading, { color: colors.danger }]}>{t('account.deleteTitle')}</Text>
        <Text style={text.body}>{t('account.deleteText')}</Text>
        <Button label={t('account.delete')} variant="danger" onPress={confirmDelete} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  warning: { borderColor: '#fde68a', backgroundColor: colors.warningSoft },
  danger: { borderColor: '#fecdd3' },
})
