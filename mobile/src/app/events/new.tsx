import { router } from 'expo-router'
import { createEvent } from '../../api/events'
import { EventForm } from '../../components/EventForm'
import { Header, Screen } from '../../components/ui'
import { useLocale } from '../../lib/i18n'

export default function CreateEvent() {
  const { t } = useLocale()
  return (
    <Screen>
      <Header kicker={t('events.organizerKicker')} title={t('events.create')} subtitle={t('createEvent.subtitle')} />
      <EventForm
        submitLabel={t('createEvent.submit')}
        onSubmit={async (input) => {
          const created = await createEvent(input)
          // Ticket types, campaigns and staff are configured next, in Manage event.
          router.replace(`/events/${created.id}/manage`)
        }}
      />
    </Screen>
  )
}
