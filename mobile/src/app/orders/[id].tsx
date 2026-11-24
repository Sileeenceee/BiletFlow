import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { getOrder, type Order } from '../../api/events'
import { Badge, Card, ErrorText, Loading, Notice, Screen, text } from '../../components/ui'
import { errorMessage, statusTone } from '../../lib/format'
import { enumLabel, useLocale } from '../../lib/i18n'

/**
 * Ticket QR codes at full size for the entrance. Only the single-order endpoint
 * returns the QR image, so the list screen links here.
 */
export default function OrderTickets() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useLocale()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getOrder(id).then(setOrder).catch((err: unknown) => setError(errorMessage(err, t('orders.loadError'))))
  }, [id, t])

  if (error) return <Screen><ErrorText message={error} /></Screen>
  if (!order) return <Loading label={t('orders.loading')} />

  const tickets = order.items.flatMap((item) => item.tickets)
  return (
    <Screen>
      <Stack.Screen options={{ title: order.eventTitle }} />
      <Notice tone="info" message={t('mobile.qrHint')} />
      {tickets.map((ticket) => (
        <Card key={ticket.id} style={styles.card}>
          <Text style={text.heading}>{ticket.ticketTypeName}</Text>
          <Text style={text.muted}>{ticket.attendeeName}</Text>
          {ticket.seatNumber ? <Text style={text.body}>{t('orders.seat', { section: ticket.sectionName ?? '', row: ticket.rowLabel ?? '', seat: ticket.seatNumber })}</Text> : null}
          <Badge label={enumLabel(t, `orders.ticketStatus.${ticket.status}`, ticket.status)} tone={statusTone(ticket.status)} />
          {ticket.qrCodeDataUri
            ? <Image source={{ uri: ticket.qrCodeDataUri }} style={styles.qr} resizeMode="contain" accessibilityLabel={t('orders.qrAlt', { name: ticket.ticketTypeName })} />
            : null}
          <View style={styles.code}><Text selectable style={styles.codeText}>{ticket.code}</Text></View>
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 8 },
  qr: { width: 260, height: 260, backgroundColor: '#ffffff' },
  code: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  codeText: { fontFamily: 'monospace', fontSize: 11, color: '#334155' },
})
