import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getEvents, getMyOrders, type Order } from '../api/events'
import { errorMessage, formatDate } from '../lib/format'
import { useLocale } from '../lib/i18n'
import { Select, text } from './ui'

type Props = {
  organizer: boolean
  eventId: string
  orderId: string
  onEvent: (eventId: string) => void
  onOrder: (orderId: string) => void
}

/**
 * Lets the requester attach the event (and order) the question is about, as on the website. The API sends
 * an attendee case with an event to that event's organizer; without one it goes to platform support (SRS 4.13).
 */
export function SupportContextFields({ organizer, eventId, orderId, onEvent, onOrder }: Props) {
  const { t } = useLocale()
  const [events, setEvents] = useState<{ id: string; title: string }[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    // Attendees pick from events they hold orders for; organizers from their own events.
    const load = organizer
      ? getEvents(true).then((rows) => ({ events: rows.map((row) => ({ id: row.id, title: row.title })), orders: [] as Order[] }))
      : getMyOrders().then((rows) => ({
        events: [...new Map(rows.map((row) => [row.eventId, { id: row.eventId, title: row.eventTitle }])).values()],
        orders: rows,
      }))
    load
      .then((value) => { if (!active) return; setEvents(value.events); setOrders(value.orders) })
      .catch((err: unknown) => { if (active) { setEvents([]); setError(errorMessage(err, t('support.contextError'))) } })
    return () => { active = false }
  }, [organizer, t])

  const eventOrders = orders.filter((order) => order.eventId === eventId)
  return (
    <View style={styles.gap}>
      <Select
        label={t('support.eventLabel')}
        value={eventId}
        onChange={(value) => { onEvent(value); onOrder('') }}
        options={[{ value: '', label: t('support.eventNone') }, ...(events ?? []).map((item) => ({ value: item.id, label: item.title }))]}
      />
      <Text style={text.muted}>{organizer ? t('support.organizerEventHint') : t('support.eventHint')}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {eventOrders.length > 0 && (
        <Select
          label={t('support.orderLabel')}
          value={orderId}
          onChange={onOrder}
          options={[
            { value: '', label: t('support.orderNone') },
            ...eventOrders.map((order) => ({ value: order.id, label: t('support.orderOption', { id: order.id.slice(0, 8), date: formatDate(order.createdAt) }) })),
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  error: { color: '#be123c', fontSize: 13 },
})
