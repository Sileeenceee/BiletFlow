import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { getAssignedEvents, type AssignedEvent } from '../../api/workflows'
import { Card, Empty, ErrorText, Header, Loading, Screen, colors, text } from '../../components/ui'
import { errorMessage, formatDateTime } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

/** Event staff see only the events they are assigned to (SRS 4.8). */
export default function CheckinEvents() {
  const { t } = useLocale()
  const [events, setEvents] = useState<AssignedEvent[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setEvents(await getAssignedEvents())
    } catch (err) {
      setError(errorMessage(err, t('checkin.loadError')))
      setEvents((current) => current ?? [])
    }
  }, [t])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
      <Header kicker={t('role.EventAdmin')} title={t('checkin.title')} subtitle={t('checkin.subtitle')} />
      <ErrorText message={error} />
      {!events ? <Loading label={t('checkin.loading')} />
        : events.length === 0 ? <Empty title={t('checkin.noEvents')} text={t('mobile.noAssignedText')} />
        : events.map((event) => (
          <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${t('mobile.openCheckin')}: ${event.title}`} onPress={() => router.push({ pathname: '/checkin/[eventId]', params: { eventId: event.id, title: event.title } })}>
            <Card>
              <Text style={text.heading}>{event.title}</Text>
              <Text style={[text.body, styles.when]}>{formatDateTime(event.startDateUtc)}</Text>
              <Text style={text.muted}>{[event.venue, event.city].filter(Boolean).join(', ')}</Text>
              <Text style={styles.open}>{t('mobile.openCheckin')} →</Text>
            </Card>
          </Pressable>
        ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  when: { fontWeight: '700' },
  open: { color: colors.brand, fontWeight: '700', marginTop: 4 },
})
