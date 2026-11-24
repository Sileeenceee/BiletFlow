import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { cancelOrder, getMyOrders, payOrder, type Order } from '../../api/events'
import { Badge, Button, Card, Empty, ErrorText, Header, Loading, Screen, text } from '../../components/ui'
import { shareApiFile } from '../../lib/files'
import { errorMessage, formatDateTime, formatKzt, statusTone } from '../../lib/format'
import { enumLabel, useLocale } from '../../lib/i18n'

/** The attendee's orders: QR codes, printable PDF tickets, calendar files and pending reservations. */
export default function Tickets() {
  const { t } = useLocale()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      setOrders(await getMyOrders())
    } catch (err) {
      setError(errorMessage(err, t('orders.loadError')))
      setOrders((current) => current ?? [])
    }
  }, [t])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function updatePending(orderId: string, action: 'pay' | 'cancel') {
    setBusy(orderId)
    setError('')
    try {
      const updated = action === 'pay' ? await payOrder(orderId, 'succeeded') : await cancelOrder(orderId)
      setOrders((current) => current?.map((order) => order.id === updated.id ? updated : order) ?? null)
    } catch (err) {
      setError(errorMessage(err, t('orders.loadError')))
    } finally {
      setBusy('')
    }
  }

  function download(path: string, filename: string, mime: string) {
    setError('')
    void shareApiFile(path, filename, mime).catch((err: unknown) => setError(errorMessage(err, t('orders.downloadError'))))
  }

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
      <Header kicker={t('orders.kicker')} title={t('orders.title')} subtitle={t('orders.subtitle')} />
      <ErrorText message={error} />
      {!orders ? <Loading label={t('orders.loading')} /> : orders.length === 0 ? (
        <>
          <Empty title={t('orders.emptyTitle')} text={t('orders.emptyText')} />
          <Button label={t('orders.explore')} onPress={() => router.push('/')} />
        </>
      ) : orders.map((order) => (
        <Card key={order.id}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={text.kicker}>{formatDateTime(order.createdAt)}</Text>
              <Text style={text.heading}>{order.eventTitle}</Text>
              <Text style={text.muted}>{t('orders.order')} #{order.id.slice(0, 8)}</Text>
            </View>
            <View style={styles.right}>
              <Badge label={enumLabel(t, `orders.status.${order.status}`, order.status)} tone={statusTone(order.status)} />
              <Text style={text.subheading}>{formatKzt(order.total)}</Text>
            </View>
          </View>
          {order.refundTotal ? <Text style={text.muted}>{t('orders.refunded', { amount: formatKzt(order.refundTotal) })}</Text> : null}
          {order.items.map((item, index) => (
            <View key={`${item.ticketTypeId}-${index}`} style={styles.item}>
              <Text style={text.subheading}>{item.ticketTypeName} · {item.quantity}</Text>
              {item.tickets.map((ticket) => (
                <View key={ticket.id} style={styles.ticket}>
                  <Text style={text.muted}>
                    {enumLabel(t, `orders.ticketStatus.${ticket.status}`, ticket.status)}{ticket.seatNumber ? ` · ${t('orders.seat', { section: ticket.sectionName ?? '', row: ticket.rowLabel ?? '', seat: ticket.seatNumber })}` : ''}
                  </Text>
                  {ticket.status !== 'Cancelled' && ticket.status !== 'Refunded' && <View style={styles.actions}>
                    <Button small label={t('orders.pdf')} onPress={() => download(`/api/tickets/${ticket.id}/pdf`, `biletflow-ticket-${ticket.id}.pdf`, 'application/pdf')} />
                    <Button small variant="secondary" label={t('orders.qr')} onPress={() => download(`/api/tickets/${ticket.id}/qr`, `biletflow-ticket-${ticket.id}.png`, 'image/png')} />
                    <Button small variant="ghost" label={t('orders.help')} onPress={() => router.push({ pathname: '/support', params: { orderId: order.id, ticketId: ticket.id, eventId: order.eventId, new: '1' } })} />
                  </View>}
                </View>
              ))}
            </View>
          ))}
          <View style={styles.actions}>
            {order.status === 'Confirmed' && <Button small label={t('mobile.showQr')} onPress={() => router.push(`/orders/${order.id}`)} />}
            <Button small variant="secondary" label={t('orders.calendar')} onPress={() => download(`/api/events/${order.eventId}/calendar.ics`, `biletflow-${order.eventId}.ics`, 'text/calendar')} />
            {order.status === 'Pending' && (
              <>
                <Button small variant="secondary" busy={busy === order.id} label={t('event.paySuccess')} onPress={() => void updatePending(order.id, 'pay')} />
                <Button small variant="danger" disabled={busy === order.id} label={t('orders.cancel')} onPress={() => void updatePending(order.id, 'cancel')} />
              </>
            )}
            {order.status !== 'Confirmed' && <Button small variant="ghost" label={t('orders.help')} onPress={() => router.push({ pathname: '/support', params: { orderId: order.id, eventId: order.eventId, new: '1' } })} />}
          </View>
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', gap: 12 },
  right: { alignItems: 'flex-end', gap: 6 },
  item: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, gap: 8 },
  ticket: { gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
