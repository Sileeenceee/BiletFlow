import { Link, router } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { login, registerAccount } from '../api/auth'
import { Button, Card, ErrorText, Field, Header, Screen, Toggle, colors, text } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errorMessage, isEmail } from '../lib/format'
import { useLocale } from '../lib/i18n'

type Intent = 'attend' | 'organize'

export default function Register() {
  const { t } = useLocale()
  const { signIn } = useAuth()
  const [intent, setIntent] = useState<Intent>('attend')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    // Password rule matches AuthService.IsValidPassword (>= 8 characters).
    const next = {
      firstName: firstName.trim() ? undefined : t('auth.required'),
      lastName: lastName.trim() ? undefined : t('auth.required'),
      email: !email.trim() ? t('auth.required') : !isEmail(email) ? t('auth.invalidEmail') : undefined,
      password: password.length < 8 ? t('auth.min8') : undefined,
      agree: agree ? undefined : t('auth.mustAgree'),
    }
    setErrors(next)
    setFormError('')
    if (Object.values(next).some(Boolean)) return
    setBusy(true)
    try {
      const created = await registerAccount({
        fullName: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim(),
        password,
        createOrganizerProfile: intent === 'organize',
      })
      // The register endpoint does not issue a token, so sign in afterwards.
      signIn(await login(email.trim(), password))
      router.replace({ pathname: '/verify-email', params: { email: email.trim(), devToken: created.verificationToken ?? '' } })
    } catch (err) {
      setFormError(errorMessage(err, t('auth.genericError')))
    } finally {
      setBusy(false)
    }
  }

  const roles: { value: Intent; title: string; hint: string }[] = [
    { value: 'attend', title: t('auth.findEvents'), hint: t('auth.findEventsHint') },
    { value: 'organize', title: t('auth.organize'), hint: t('auth.organizeHint') },
  ]

  return (
    <Screen>
      <Header title={t('auth.signupTitle')} subtitle={t('auth.signupSubtitle')} />
      <Card style={styles.form}>
        <Text style={text.label}>{t('auth.iWantTo')}</Text>
        <View accessibilityRole="radiogroup" style={styles.roles}>
          {roles.map((role) => (
            <Pressable key={role.value} accessibilityRole="radio" accessibilityState={{ selected: intent === role.value }} onPress={() => setIntent(role.value)} style={[styles.role, intent === role.value && styles.roleSelected]}>
              <Text style={text.subheading}>{role.title}</Text>
              <Text style={text.muted}>{role.hint}</Text>
            </Pressable>
          ))}
        </View>
        <Field label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} error={errors.firstName} autoComplete="given-name" />
        <Field label={t('auth.lastName')} value={lastName} onChangeText={setLastName} error={errors.lastName} autoComplete="family-name" />
        <Field label={t('auth.email')} hint={t('auth.emailHint')} value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="mail@nu.edu.kz" />
        <Field label={t('auth.password')} value={password} onChangeText={setPassword} error={errors.password} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Toggle label={t('auth.agree')} value={agree} onChange={setAgree} />
        {errors.agree ? <Text accessibilityRole="alert" style={styles.error}>{errors.agree}</Text> : null}
        <ErrorText message={formError} />
        <Button label={busy ? t('auth.creating') : t('auth.signupButton')} busy={busy} onPress={() => void submit()} />
        <Text style={[text.muted, styles.center]}>{t('auth.haveAccount')} <Link href="/login" style={text.link}>{t('auth.logInLink')}</Link></Text>
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  roles: { gap: 10 },
  role: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, gap: 2 },
  roleSelected: { borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  error: { color: colors.danger, fontSize: 13 },
  center: { textAlign: 'center' },
})
