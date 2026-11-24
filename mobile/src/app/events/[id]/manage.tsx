import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { getEvent, type EventSummary } from '../../../api/events'
import { Badge, Button, ErrorText, Loading, Notice, Screen, Segmented } from '../../../components/ui'
import { Campaigns } from '../../../screens/manage/Campaigns'
import { Analytics, History } from '../../../screens/manage/Insights'
import { Orders } from '../../../screens/manage/Orders'
import { Overview } from '../../../screens/manage/Overview'
import { Attendees, Team } from '../../../screens/manage/People'
import { Seating } from '../../../screens/manage/Seating'
import { Tickets } from '../../../screens/manage/Tickets'
import type { TabProps } from '../../../screens/manage/types'
import { errorMessage } from '../../../lib/format'
import { useLocale } from '../../../lib/i18n'

const tabs = {
  Overview, Tickets, Seating, Campaigns, Attendees, Orders, Analytics, History, Team,
} satisfies Record<string, (props: TabProps) => ReactNode>
type Tab = keyof typeof tabs

/** Organizer workspace for one event, with the same sections as the website's Manage event page. */
export default function ManageEvent() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>()
  const { t } = useLocale()
  const [tab, setTab] = useState<Tab>(params.tab && params.tab in tabs ? params.tab as Tab : 'Overview')
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    getEvent(params.id).then(setEvent).catch((err: unknown) => setError(errorMessage(err, t('event.loadError'))))
  }, [params.id, t])

  const onError = useCallback((value: string) => setError(value), [])
  const onMessage = useCallback((value: string) => setMessage(value), [])

  function switchTab(next: Tab) {
    setTab(next)
    setError('')
    setMessage('')
  }

  if (!event) return error ? <Screen><ErrorText message={error} /></Screen> : <Loading label={t('manageEvent.loading')} />
  const Content = tabs[tab]

  return (
    <Screen>
      <Stack.Screen options={{ title: event.title }} />
      <View style={styles.head}>
        {event.lifecycleStatus && <Badge label={t(`dashboard.lifecycle.${event.lifecycleStatus}`)} />}
        <Button small variant="secondary" label={t('manageEvent.preview')} onPress={() => router.push(`/events/${event.id}`)} />
      </View>
      {event.isSuspended && <ErrorText message={t('manageEvent.suspended')} />}
      <Segmented value={tab} onChange={switchTab} items={(Object.keys(tabs) as Tab[]).map((item) => ({ value: item, label: t(`manageEvent.tab.${item}`) }))} />
      <Notice message={message} />
      <ErrorText message={error} />
      <Content event={event} onEvent={setEvent} onError={onError} onMessage={onMessage} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
})
