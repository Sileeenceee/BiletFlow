import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { resolveCampaign } from '../api/events'
import { useLocale } from '../lib/i18n'

export default function CampaignRedirect() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLocale()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    resolveCampaign(token)
      .then((campaign) => {
        if (active) navigate(`/events/${campaign.eventId}?campaignToken=${encodeURIComponent(token)}&promoCode=${encodeURIComponent(campaign.code)}`, { replace: true })
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t('campaign.unavailable'))
      })
    return () => { active = false }
  }, [navigate, t, token])

  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-indigo-600">{t('campaign.kicker')}</p>
      <h1 className="mt-2 text-2xl font-bold">{error ? t('campaign.failed') : t('campaign.checking')}</h1>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : <p className="mt-3 text-sm text-slate-500">{t('campaign.validating')}</p>}
    </section>
  )
}
