import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { createOrganizerProfile, getOrganizerProfile, saveOrganizerProfile, type OrganizerProfile as Profile } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { useLocale } from '../lib/i18n'

export default function OrganizerProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { t } = useLocale()

  useEffect(() => {
    let active = true
    getOrganizerProfile()
      .then((value) => { if (active) setProfile(value) })
      .catch((err: unknown) => {
        if (!active) return
        if (err instanceof ApiError && err.status === 404) setIsNew(true)
        else setError(err instanceof Error ? err.message : t('organizerProfile.loadError'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const input = {
      businessName: String(data.get('businessName')).trim(),
      displayName: String(data.get('displayName')).trim(),
      contactEmail: String(data.get('contactEmail')).trim(),
      sandboxPayoutProvider: String(data.get('sandboxPayoutProvider')).trim(),
      sandboxPayoutReference: String(data.get('sandboxPayoutReference')).trim(),
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
      setError(err instanceof Error ? err.message : t('organizerProfile.saveError'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-slate-500">{t('organizerProfile.loading')}</p>
  if (error && !profile && !isNew) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p>
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header><p className="text-sm font-semibold text-indigo-600">{t('organizerProfile.kicker')}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{t('organizerProfile.title')}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{t('organizerProfile.subtitle')}</p></header>
      <form onSubmit={(event) => void submit(event)} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">{t('organizerProfile.businessName')}<input required maxLength={160} name="businessName" defaultValue={profile?.businessName ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-semibold text-slate-700">{t('organizerProfile.displayName')}<input required maxLength={120} name="displayName" defaultValue={profile?.displayName ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">{t('organizerProfile.contactEmail')}<input type="email" maxLength={320} name="contactEmail" defaultValue={profile?.contactEmail ?? ''} className={`${inputClass} mt-1.5`} /></label>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-950">{t('organizerProfile.payoutTitle')}</h2>
          <p className="mt-1 text-xs leading-5 text-amber-900">{t('organizerProfile.payoutWarning')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">{t('organizerProfile.provider')}<input maxLength={80} name="sandboxPayoutProvider" placeholder={t('organizerProfile.providerPlaceholder')} defaultValue={profile?.sandboxPayoutProvider ?? ''} className={`${inputClass} mt-1.5`} /></label>
            <label className="text-sm font-medium text-slate-700">{t('organizerProfile.reference')}<input maxLength={120} name="sandboxPayoutReference" placeholder={t('organizerProfile.referencePlaceholder')} defaultValue={profile?.sandboxPayoutReference ?? ''} className={`${inputClass} mt-1.5`} /></label>
          </div>
        </div>
        {profile && <p className="text-sm text-slate-500">{t('organizerProfile.verification')}: <strong className={profile.isVerified ? 'text-emerald-700' : 'text-amber-700'}>{profile.isVerified ? t('organizerProfile.verified') : t('organizerProfile.notVerified')}</strong></p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <button disabled={busy} className={buttonClass}>{busy ? t('common.saving') : isNew ? t('organizerProfile.create') : t('organizerProfile.save')}</button>
      </form>
    </div>
  )
}
