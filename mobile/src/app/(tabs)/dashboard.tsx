import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { duplicateEvent } from '../../api/events'
import { getOrganizerDashboard, type OrganizerDashboard } from '../../api/platform'
import { DateField } from '../../components/DateField'
import { Badge, Button, Card, Empty, ErrorText, Header, Loading, Notice, Screen, Segmented, Stat, text } from '../../components/ui'
import { dayBoundary, errorMessage, formatDateTime, formatKzt, formatNumber } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

const lifecycles = ['Upcoming', 'Active', 'Completed', 'Cancelled'] as const
type Lifecycle = typeof lifecycles[number]
const tone = { Upcoming: 'brand', Active: 'success', Completed: 'neutral', Cancelled: 'danger' } as const

/** Organizer overview with Upcoming / Active / Completed / Cancelled views (SRS 4.15, 4.16). */
export default function Dashboard() {
  const { t } = useLocale()
  const [data, setData] = useState<OrganizerDashboard | null>(null)
  const [filter, setFilter] = useState<Lifecycle | 'All'>('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await getOrganizerDashboard({ from: dayBoundary(from), to: dayBoundary(to, true) }))
    } catch (err) {
      setError(errorMessage(err, t('dashboard.loadError')))
    }
  }, [from, t, to])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function duplicate(eventId: string) {
    setError('')
    setMessage('')
    try {
      const copy = await duplicateEvent(eventId)
      setMessage(t('dashboard.copied', { title: copy.title }))
      await load()
    } catch (err) {
      setError(errorMessage(err, t('dashboard.duplicateError')))
    }
  }

  if (!data) return error ? <Screen><ErrorText message={error} /></Screen> : <Loading label={t('dashboard.loading')} />
  const events = data.events.filter((event) => filter === 'All' || event.lifecycleStatus === filter)
  const counts: Record<Lifecycle, number> = { Upcoming: data.upcoming, Active: data.active, Completed: data.completed, Cancelled: data.cancelled }

  return (
    <Screen onRefresh={() => void load()}>
      <Header kicker={t('events.organizerKicker')} title={t('nav.dashboard')} subtitle={`${t('dashboard.subtitle')}${data.isDemonstration ? ` ${t('dashboard.demo')}` : ''}`} />
      <Button label={t('events.create')} onPress={() => router.push('/events/new')} />
      <View style={styles.dates}>
        <View style={styles.flex}><DateField mode="date" label={t('analytics.from')} value={from} onChange={setFrom} optional /></View>
        <View style={styles.flex}><DateField mode="date" label={t('analytics.to')} value={to} onChange={setTo} optional /></View>
      </View>
      <ErrorText message={error} />
      <Notice message={message} />
      <View style={styles.stats}>
        <Stat label={t('dashboard.events')} value={formatNumber(data.eventCount)} hint={t('dashboard.eventsHint', { upcoming: data.upcoming, active: data.active })} />
        <Stat label={t('analytics.ticketsSold')} value={formatNumber(data.ticketsSold)} />
        <Stat label={t('analytics.netRevenue')} value={formatKzt(data.netRevenue)} hint={t('analytics.grossHint', { amount: formatKzt(data.grossSales) })} />
        <Stat label={t('analytics.payout')} value={formatKzt(data.estimatedPayout)} hint={t('dashboard.payoutHint')} />
      </View>
      <Segmented
        label={t('dashboard.statusTabs')}
        value={filter}
        onChange={setFilter}
        items={[{ value: 'All' as const, label: t('dashboard.all') }, ...lifecycles.map((item) => ({ value: item, label: `${t(`dashboard.lifecycle.${item}`)} ${counts[item]}` }))]}
      />
      {events.length === 0 ? <Empty title={t('dashboard.empty')} /> : events.map((event) => (
        <Card key={event.eventId}>
          <Pressable accessibilityRole="link" onPress={() => router.push(`/events/${event.eventId}/manage`)}>
            <Text style={text.heading}>{event.title}</Text>
            <Text style={text.muted}>{formatDateTime(event.startDateUtc)}{event.isPublished ? '' : ` · ${t('events.draft')}`}</Text>
          </Pressable>
          <Badge label={t(`dashboard.lifecycle.${event.lifecycleStatus}`)} tone={tone[event.lifecycleStatus]} />
          <Text style={text.body}>{t('dashboard.soldOfCapacity')}: {event.ticketsSold} / {event.totalCapacity} · {t('analytics.checkedIn')}: {event.checkedIn}</Text>
          <Text style={text.subheading}>{formatKzt(event.netRevenue)}</Text>
          <View style={styles.actions}>
            <Button small variant="secondary" label={t('manageEvent.tab.Analytics')} onPress={() => router.push({ pathname: '/events/[id]/manage', params: { id: event.eventId, tab: 'Analytics' } })} />
            <Button small variant="secondary" label={t('manageEvent.tab.History')} onPress={() => router.push({ pathname: '/events/[id]/manage', params: { id: event.eventId, tab: 'History' } })} />
            <Button small variant="ghost" label={t('dashboard.duplicate')} onPress={() => void duplicate(event.eventId)} />
          </View>
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dates: { flexDirection: 'row', gap: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
