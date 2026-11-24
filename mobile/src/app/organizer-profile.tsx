import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { ApiError } from '../api/client'
import { createOrganizerProfile, getOrganizerProfile, saveOrganizerProfile, type OrganizerProfile as Profile } from '../api/workflows'
import { Badge, Button, Card, ErrorText, Field, Header, Loading, Notice, Screen, text } from '../components/ui'
import { errorMessage } from '../lib/format'
import { useLocale } from '../lib/i18n'

export default function OrganizerProfile() {
  const { t } = useLocale()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ businessName: '', displayName: '', contactEmail: '', sandboxPayoutProvider: '', sandboxPayoutReference: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    getOrganizerProfile()
      .then((value) => {
        setProfile(value)
        setForm({
          businessName: value.businessName, displayName: value.displayName, contactEmail: value.contactEmail ?? '',
          sandboxPayoutProvider: value.sandboxPayoutProvider ?? '', sandboxPayoutReference: value.sandboxPayoutReference ?? '',
        })
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) setIsNew(true)
        else setError(errorMessage(err, t('organizerProfile.loadError')))
      })
      .finally(() => setLoading(false))
  }, [t])

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  async function submit() {
    const input = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as typeof form
    if (!input.businessName || !input.displayName) {
      setError(t('auth.required'))
      return
    }
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const saved = isNew ? await createOrganizerProfile(input) : await saveOrganizerProfile(input)
      setProfile(saved)
      setIsNew(false)
      setMessage(t('organizerProfile.saved'))
    } catch (err) {
      setError(errorMessage(err, t('organizerProfile.saveError')))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading label={t('organizerProfile.loading')} />
  return (
    <Screen>
      <Header kicker={t('organizerProfile.kicker')} title={t('organizerProfile.title')} subtitle={t('organizerProfile.subtitle')} />
      <Card style={styles.gap}>
        <Field label={t('organizerProfile.businessName')} value={form.businessName} onChangeText={set('businessName')} maxLength={160} />
        <Field label={t('organizerProfile.displayName')} value={form.displayName} onChangeText={set('displayName')} maxLength={120} />
        <Field label={t('organizerProfile.contactEmail')} value={form.contactEmail} onChangeText={set('contactEmail')} maxLength={320} autoCapitalize="none" keyboardType="email-address" />
      </Card>
      <Card style={[styles.gap, styles.payout]}>
        <Text style={text.subheading}>{t('organizerProfile.payoutTitle')}</Text>
        <Text style={text.muted}>{t('organizerProfile.payoutWarning')}</Text>
        <Field label={t('organizerProfile.provider')} placeholder={t('organizerProfile.providerPlaceholder')} value={form.sandboxPayoutProvider} onChangeText={set('sandboxPayoutProvider')} maxLength={80} />
        <Field label={t('organizerProfile.reference')} placeholder={t('organizerProfile.referencePlaceholder')} value={form.sandboxPayoutReference} onChangeText={set('sandboxPayoutReference')} maxLength={120} autoCapitalize="none" />
      </Card>
      {profile && (
        <Card>
          <Text style={text.muted}>{t('organizerProfile.verification')}</Text>
          <Badge label={profile.isVerified ? t('organizerProfile.verified') : t('organizerProfile.notVerified')} tone={profile.isVerified ? 'success' : 'warning'} />
        </Card>
      )}
      <ErrorText message={error} />
      <Notice message={message} />
      <Button label={busy ? t('common.saving') : isNew ? t('organizerProfile.create') : t('organizerProfile.save')} busy={busy} onPress={() => void submit()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  payout: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
})
