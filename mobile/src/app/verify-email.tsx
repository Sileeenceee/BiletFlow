import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Linking, StyleSheet } from 'react-native'
import { getCurrentUser, resendVerification, verifyEmail } from '../api/auth'
import { Button, Card, ErrorText, Field, Header, Loading, Notice, Screen } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/format'
import { useLocale } from '../lib/i18n'

type Status = 'idle' | 'working' | 'done' | 'failed'

/**
 * Verification links in emails open the website; in the app the token from the
 * link (or the development token returned on sign-up) can be entered here.
 */
export default function VerifyEmail() {
  const { t } = useLocale()
  const { user, updateUser } = useAuth()
  const params = useLocalSearchParams<{ token?: string; email?: string; devToken?: string }>()
  const email = params.email || user?.email || ''
  const [token, setToken] = useState(params.token ?? '')
  const [devToken, setDevToken] = useState(params.devToken || '')
  const [status, setStatus] = useState<Status>(params.token ? 'working' : 'idle')
  const [message, setMessage] = useState('')
  const [resend, setResend] = useState<'idle' | 'working' | 'sent'>('idle')
  const autoRan = useRef(false)

  async function submit(value: string) {
    setStatus('working')
    setMessage('')
    try {
      const res = await verifyEmail(value.trim())
      setMessage(res.message)
      setStatus('done')
      if (user) {
        try {
          updateUser({ emailConfirmed: (await getCurrentUser()).emailConfirmed })
        } catch {
          // Verification itself succeeded; the banner clears at the next sign-in.
        }
      }
    } catch (err) {
      setMessage(errorMessage(err, t('auth.genericError')))
      setStatus('failed')
    }
  }

  // The token is single-use, so an incoming link is verified once.
  useEffect(() => {
    if (params.token && !autoRan.current) {
      autoRan.current = true
      void submit(params.token)
    }
  }, [params.token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onResend() {
    if (!email) return
    setResend('working')
    setMessage('')
    try {
      const res = await resendVerification(email)
      setDevToken(res.verificationToken ?? '')
      setResend('sent')
    } catch (err) {
      setMessage(errorMessage(err, t('auth.genericError')))
      setResend('idle')
    }
  }

  if (status === 'working') return <Loading label={t('auth.verifying')} />

  if (status === 'done') {
    return (
      <Screen>
        <Header title={t('auth.verifiedTitle')} subtitle={message} />
        <Button label={t('auth.continue')} onPress={() => router.replace('/')} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Header
        title={status === 'failed' ? t('auth.verifyFailedTitle') : t('auth.inboxTitle')}
        subtitle={email ? t('auth.inboxText', { email }) : t('auth.inboxTextNoEmail')}
      />
      <ErrorText message={message} />
      <Button label={t('auth.openEmail')} variant="secondary" onPress={() => void Linking.openURL('mailto:')} />
      {email ? (
        <Button label={resend === 'working' ? t('auth.resending') : t('auth.resend')} variant="secondary" busy={resend === 'working'} onPress={() => void onResend()} />
      ) : null}
      {resend === 'sent' && <Notice message={t('auth.resent')} />}
      {devToken ? (
        <Card style={styles.gap}>
          <Notice tone="warning" message={t('auth.devLink')} />
          <Button label={t('auth.verifyLink')} onPress={() => void submit(devToken)} />
        </Card>
      ) : null}
      <Card style={styles.gap}>
        <Field label={t('mobile.tokenLabel')} hint={t('mobile.tokenHint')} value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} />
        <Button label={t('auth.verifyLink')} disabled={!token.trim()} onPress={() => void submit(token)} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({ gap: { gap: 12 } })
