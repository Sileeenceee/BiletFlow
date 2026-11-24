import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { resolveCampaign } from '../../api/events'
import { ErrorText, Header, Loading, Screen } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

/**
 * Campaign QR links (biletflow://campaign/<token>) open the event with the promo
 * pre-applied after the server has validated the campaign, as on the website.
 */
export default function CampaignRedirect() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const { t } = useLocale()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    resolveCampaign(token)
      .then((campaign) => {
        if (active) router.replace({ pathname: '/events/[id]', params: { id: campaign.eventId, campaignToken: token, promoCode: campaign.code } })
      })
      .catch((err: unknown) => { if (active) setError(errorMessage(err, t('campaign.unavailable'))) })
    return () => { active = false }
  }, [t, token])

  return (
    <Screen>
      <Header kicker={t('campaign.kicker')} title={error ? t('campaign.failed') : t('campaign.checking')} subtitle={error ? undefined : t('campaign.validating')} />
      {error ? <ErrorText message={error} /> : <Loading />}
    </Screen>
  )
}
