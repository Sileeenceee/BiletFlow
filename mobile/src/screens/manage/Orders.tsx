import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { cancelFreeOrder, getEventOrders, type Order } from '../../api/events'
import { getEventRefunds, refundOrder, type Refund } from '../../api/platform'
import { Badge, Button, Card, Empty, Field, Header, Row, Stat, colors, text } from '../../components/ui'
import { errorMessage, formatDateTime, formatKzt, statusTone } from '../../lib/format'
import { enumLabel, useLocale } from '../../lib/i18n'
import type { TabProps } from './types'

/** Orders, free-registration cancellation and full simulated refunds (SRS 4.9). */
export function Orders({ event, onError }: TabProps) {
  const { t } = useLocale()
  const [orders, setOrders] = useState<Order[]>([])
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [busyOrder, setBusyOrder] = useState('')
  const [refunding, setRefunding] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    Promise.all([getEventOrders(event.id), getEventRefunds(event.id)])
      .then(([orderRows, refundRows]) => { setOrders(orderRows); setRefunds(refundRows) })
      .catch((err: unknown) => onError(errorMessage(err, t('manageEvent.ordersLoadError'))))
  }, [event.id, onError, t])

  async function update(orderId: string, action: () => Promise<Order>, failure: string) {
    onError('')
    setBusyOrder(orderId)
    try {
      const updated = await action()
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order))
      setRefunds(await getEventRefunds(event.id))
      setRefunding('')
      setReason('')
    } catch (err) {
      onError(errorMessage(err, failure))
    } finally {
      setBusyOrder('')
    }
  }

  const gross = orders.filter((order) => order.status === 'Confirmed' || order.status === 'Refunded').reduce((sum, order) => sum + order.total, 0)
  const fees = orders.filter((order) => order.status === 'Confirmed').reduce((sum, order) => sum + order.feeTotal, 0)
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0)
  const demo = t('manageEvent.demoOnly')

  return (
    <View style={styles.gap}>
      <View style={styles.stats}>
        <Stat label={t('analytics.grossSales')} value={formatKzt(gross)} hint={demo} />
        <Stat label={t('analytics.fees')} value={formatKzt(fees)} hint={demo} />
        <Stat label={t('analytics.refunds')} value={formatKzt(refunded)} hint={demo} />
        <Stat label={t('analytics.payout')} value={formatKzt(gross - fees - refunded)} hint={demo} />
      </View>
      <Header title={t('manageEvent.tab.Orders')} subtitle={t('manageEvent.ordersText')} />
      {orders.length === 0 ? <Empty title={t('manageEvent.noOrders')} /> : orders.map((order) => {
        const ticket = order.items[0]?.tickets[0]
        return (
          <Card key={order.id}>
            <View style={styles.row}>
              <Text style={[text.subheading, styles.flex]}>{t('orders.order')} {order.id.slice(0, 8)}</Text>
              <Badge label={enumLabel(t, `orders.status.${order.status}`, order.status)} tone={statusTone(order.status)} />
            </View>
            <Text style={text.muted}>{formatDateTime(order.createdAt)}</Text>
            {ticket ? <Text style={text.body}>{ticket.attendeeName} · {ticket.attendeeEmail}</Text> : null}
            <Row label={t('manageEvent.tickets')} value={String(order.items.reduce((sum, item) => sum + item.quantity, 0))} />
            <Row label={t('event.total')} value={formatKzt(order.total)} strong />
            {order.promoCode ? <Text style={styles.promo}>{order.promoCode} −{formatKzt(order.discountTotal)}</Text> : null}
            {order.status === 'Confirmed' && order.total === 0 && (
              <Button small variant="danger" busy={busyOrder === order.id} label={t('manageEvent.cancelFree')} onPress={() => void update(order.id, () => cancelFreeOrder(event.id, order.id), t('manageEvent.cancelOrderError'))} />
            )}
            {order.status === 'Confirmed' && order.total > 0 && refunding !== order.id && (
              <Button small variant="danger" label={t('manageEvent.refundOrder')} onPress={() => { setRefunding(order.id); setReason('') }} />
            )}
            {refunding === order.id && (
              <View style={styles.gap}>
                <Field label={t('manageEvent.refundReason')} placeholder={t('manageEvent.reasonPlaceholder')} value={reason} onChangeText={setReason} maxLength={500} />
                <Button variant="danger" busy={busyOrder === order.id} label={t('manageEvent.confirmRefund', { amount: formatKzt(order.total) })} onPress={() => void update(order.id, () => refundOrder(event.id, order.id, reason.trim()), t('manageEvent.refundError'))} />
                <Button variant="ghost" label={t('manageEvent.keepOrder')} onPress={() => setRefunding('')} />
              </View>
            )}
          </Card>
        )
      })}
      {refunds.length > 0 && (
        <Card>
          <Text style={text.heading}>{t('analytics.refunds')}</Text>
          {refunds.map((refund) => (
            <Row key={refund.id} label={`${refund.orderId.slice(0, 8)} · ${formatDateTime(refund.createdAt)}${refund.reason ? ` · ${refund.reason}` : ''}`} value={`${formatKzt(refund.amount)}${refund.isSimulated ? ` ${t('manageEvent.simulated')}` : ''}`} />
          ))}
        </Card>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  promo: { color: colors.success, fontSize: 13 },
})
