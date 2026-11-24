import { Link, router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { login, logout } from '../api/auth'
import { Button, Card, ErrorText, Field, Header, Screen, Toggle, colors, text } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errorMessage, isEmail } from '../lib/format'
import { useLocale } from '../lib/i18n'
import { getServer, setServer } from '../lib/storage'

export default function Login() {
  const { t } = useLocale()
  const { signIn } = useAuth()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keep, setKeep] = useState(true)
  const [server, setServerDraft] = useState(getServer())
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const next = {
      email: !email.trim() ? t('auth.required') : !isEmail(email) ? t('auth.invalidEmail') : undefined,
      password: !password ? t('auth.required') : undefined,
    }
    setErrors(next)
    setFormError('')
    if (next.email || next.password) return
    setBusy(true)
    try {
      setServer(server)
      const session = await login(email.trim(), password)
      if (!keep && session.refreshToken) {
        // Without the refresh token the session ends when the access token expires.
        void logout(session.refreshToken).catch(() => undefined)
        session.refreshToken = undefined
      }
      signIn(session)
      // Only in-app paths are accepted as a return target.
      if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) router.replace(from as never)
      else router.replace('/')
    } catch (err) {
      setFormError(errorMessage(err, t('auth.genericError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.logo}><Text style={styles.logoText}>B</Text></View>
        <Header title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')} />
        <Card style={styles.form}>
          <Field label={t('auth.email')} value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" placeholder="mail@nu.edu.kz" />
          <Field label={t('auth.password')} value={password} onChangeText={setPassword} error={errors.password} secureTextEntry textContentType="password" autoComplete="current-password" onSubmitEditing={() => void submit()} />
          <Toggle label={t('auth.keepLoggedIn')} value={keep} onChange={setKeep} />
          <Link href="/forgot-password" style={text.link}>{t('auth.forgot')}</Link>
          <Field label={t('mobile.server')} hint={t('mobile.serverHint')} value={server} onChangeText={setServerDraft} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <ErrorText message={formError} />
          <Button label={busy ? t('auth.loggingIn') : t('auth.loginButton')} busy={busy} onPress={() => void submit()} />
        </Card>
        <Text style={[text.muted, styles.center]}>{t('auth.or')}</Text>
        <Button label={t('auth.createAccount')} variant="secondary" onPress={() => router.push('/register')} />
      </Screen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  logo: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#ffffff', fontSize: 24, fontWeight: '800' },
  form: { gap: 14 },
  center: { textAlign: 'center' },
})
