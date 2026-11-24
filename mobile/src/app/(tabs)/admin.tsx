import { useCallback, useState } from 'react'
import { ErrorText, Header, Notice, Screen, Segmented } from '../../components/ui'
import { useLocale } from '../../lib/i18n'
import { Events, Overview, Reports, Settings, Users, type Notify } from '../../screens/admin/Moderation'
import { Activations, Orders, Payments, Promo, Refunds, Support } from '../../screens/admin/Records'

const sections = { Overview, Users, Events, Reports, Orders, Payments, Refunds, Activations, Promo, Support, Settings }
type Section = keyof typeof sections

/** Administrative portal for Platform Admins (SRS 4.12), with the website's sections. */
export default function Admin() {
  const { t } = useLocale()
  const [section, setSection] = useState<Section>('Overview')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const onError = useCallback((value: string) => setError(value), [])
  const onMessage = useCallback((value: string) => setMessage(value), [])
  const notify: Notify = { onError, onMessage }
  const Content = sections[section]

  function select(next: Section) {
    setSection(next)
    setError('')
    setMessage('')
  }

  return (
    <Screen>
      <Header kicker={t('admin.kicker')} title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Segmented value={section} onChange={select} items={(Object.keys(sections) as Section[]).map((item) => ({ value: item, label: t(`admin.tab.${item}`) }))} />
      <Notice message={message} />
      <ErrorText message={error} />
      <Content {...notify} />
    </Screen>
  )
}
