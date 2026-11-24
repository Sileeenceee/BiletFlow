import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { checkout, getEvent, getTicketTypes, payOrder, type EventSummary, type Order, type TicketType } from '../../../api/events'
import { getCalendarLinks, getQuote, getSeatMap, reportEvent, type CalendarLinks, type Quote, type Seat, type SeatMap as SeatMapData } from '../../../api/platform'
import { SeatMap } from '../../../components/SeatMap'
import { Button, Card, ErrorText, Field, Header, Loading, Notice, Row, Screen, Select, colors, text } from '../../../components/ui'
import { useAuth } from '../../../lib/auth'
import { shareApiFile } from '../../../lib/files'
import { errorMessage, formatDateTime, formatKzt } from '../../../lib/format'
import { useLocale, type MessageKey } from '../../../lib/i18n'

const MAX_SEATS_PER_ORDER = 10
const reportReasons: { value: string; label: MessageKey }[] = [
  { value: 'Misleading information', label: 'event.reason.misleading' },
  { value: 'Suspected fraud', label: 'event.reason.fraud' },
  { value: 'Prohibited content', label: 'event.reason.prohibited' },
  { value: 'Other', label: 'event.reason.other' },
]

/** Event page with ticket or seat selection and the simulated checkout, as on the website. */
export default function EventDetail() {
  const params = useLocalSearchParams<{ id: string; campaignToken?: string; promoCode?: string }>()
  const eventId = params.id
  const { user } = useAuth()
  const { t } = useLocale()
  const linkToken = params.campaignToken || undefined
  const linkPromo = params.promoCode ?? ''
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [seatMap, setSeatMap] = useState<SeatMapData | null>(null)
  const [calendar, setCalendar] = useState<CalendarLinks | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [seats, setSeats] = useState<Seat[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [promoCode, setPromoCode] = useState(linkPromo)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState(reportReasons[0].value)
  const [reportDetails, setReportDetails] = useState('')
  const [reportMessage, setReportMessage] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([getEvent(eventId), getTicketTypes(eventId)])
      .then(([eventInfo, ticketTypes]) => {
        if (!active) return
        setEvent(eventInfo)
        setTickets(ticketTypes)
        // The seat map only exists for assigned-seating events.
        if (eventInfo.seatingMode === 'Assigned') {
          getSeatMap(eventId)
            .then((map) => { if (active) setSeatMap(map) })
            .catch((err: unknown) => { if (active) setError(errorMessage(err, t('event.loadError'))) })
        }
      })
      .catch((err: unknown) => { if (active) setError(errorMessage(err, t('event.loadError'))) })
    // Calendar links are an extra; the page works without them.
    getCalendarLinks(eventId).then((links) => { if (active) setCalendar(links) }).catch(() => undefined)
    return () => { active = false }
  }, [eventId, t])

  const assigned = event?.seatingMode === 'Assigned' && seatMap?.seatingMode === 'Assigned'
  const selectedItems = useMemo(() => tickets
    .filter((ticket) => (quantities[ticket.id] ?? 0) > 0)
    .map((ticket) => ({ ticketTypeId: ticket.id, quantity: quantities[ticket.id] })), [quantities, tickets])
  const seatIds = useMemo(() => seats.map((seat) => seat.seatId), [seats])
  const seatSection = (seat: Seat) => seatMap?.sections.find((section) => section.seats.some((item) => item.seatId === seat.seatId))
  const seatPrice = (seat: Seat) => seatSection(seat)?.price ?? 0
  const subtotal = assigned
    ? seats.reduce((sum, seat) => sum + seatPrice(seat), 0)
    : tickets.reduce((sum, ticket) => sum + ticket.price * (quantities[ticket.id] ?? 0), 0)
  const hasSelection = assigned ? seats.length > 0 : selectedItems.length > 0
  const hasPaidTickets = subtotal > 0
  const paidSalesReady = event?.paidSalesStatus === 'Active'
  const typedPromo = promoCode.trim()
  // The API accepts a campaign link or a typed promo code, never both. The link wins while its
  // pre-filled code is untouched; editing the field switches to the typed code.
  const campaignToken = linkToken && typedPromo === linkPromo ? linkToken : undefined
  const appliedPromo = campaignToken ? '' : typedPromo

  // The server prices the order and validates the promo code; the client never trusts its own discount.
  useEffect(() => {
    if (!hasSelection || (!appliedPromo && !campaignToken)) return
    let active = true
    const timer = setTimeout(() => {
      getQuote({ eventId, items: assigned ? [] : selectedItems, seatIds: assigned ? seatIds : undefined, promoCode: appliedPromo || undefined, campaignToken })
        .then((value) => { if (active) setQuote(value) })
        .catch(() => { if (active) setQuote(null) })
    }, 400)
    return () => { active = false; clearTimeout(timer) }
  }, [appliedPromo, assigned, campaignToken, eventId, hasSelection, seatIds, selectedItems])
  const activeQuote = hasSelection && (appliedPromo || campaignToken) ? quote : null

  function toggleSeat(seat: Seat) {
    setSeats((current) => current.some((item) => item.seatId === seat.seatId)
      ? current.filter((item) => item.seatId !== seat.seatId)
      : [...current, seat])
  }

  function setQuantity(ticket: TicketType, delta: number) {
    const max = Math.min(ticket.maxPerOrder, ticket.availableQuantity)
    setQuantities((current) => ({ ...current, [ticket.id]: Math.max(0, Math.min(max, (current[ticket.id] ?? 0) + delta)) }))
  }

  async function submitCheckout() {
    setError('')
    if (!user) {
      router.push({ pathname: '/login', params: { from: `/events/${eventId}` } })
      return
    }
    setBusy(true)
    try {
      setOrder(await checkout({
        eventId,
        attendeeName: name.trim(),
        attendeeEmail: email.trim(),
        items: assigned ? [] : selectedItems,
        seatIds: assigned ? seatIds : undefined,
        promoCode: appliedPromo || undefined,
        campaignToken,
      }))
    } catch (err) {
      setError(errorMessage(err, t('event.reserveError')))
      // Someone else may have taken a seat in the meantime: show the current map.
      if (assigned) {
        setSeats([])
        getSeatMap(eventId).then(setSeatMap).catch(() => undefined)
      }
    } finally {
      setBusy(false)
    }
  }

  async function simulatePayment(outcome: 'succeeded' | 'failed') {
    if (!order) return
    setError('')
    setBusy(true)
    try {
      setOrder(await payOrder(order.id, outcome))
    } catch (err) {
      setError(errorMessage(err, t('event.payError')))
    } finally {
      setBusy(false)
    }
  }

  async function submitReport() {
    setReportMessage('')
    try {
      await reportEvent(eventId, reportReason, reportDetails.trim())
      setReportOpen(false)
      setReportMessage(t('event.reportSent'))
    } catch (err) {
      setReportMessage(errorMessage(err, t('event.reportError')))
    }
  }

  if (error && !event) return <Screen><ErrorText message={error} /></Screen>
  if (!event) return <Loading label={t('event.loading')} />

  if (order) {
    const confirmed = order.status === 'Confirmed'
    return (
      <Screen>
        <Stack.Screen options={{ title: event.title }} />
        <View style={[styles.statusIcon, { backgroundColor: confirmed ? colors.successSoft : colors.warningSoft }]}>
          <Text style={[styles.statusSymbol, { color: confirmed ? colors.success : colors.warning }]}>{confirmed ? '✓' : '⌛'}</Text>
        </View>
        <Header
          kicker={`${t('orders.order')} ${order.id.slice(0, 8)}`}
          title={confirmed ? t('event.ready') : t('event.reserved')}
          subtitle={confirmed ? t('event.readyText') : t('event.reservedText', { time: order.expiresAt ? formatDateTime(order.expiresAt) : '—' })}
        />
        <Card>
          <Row label={event.title} value={formatKzt(order.total)} strong />
          {order.items.map((item, index) => <Text key={`${item.ticketTypeId}-${index}`} style={text.body}>{item.quantity} × {item.ticketTypeName}</Text>)}
          {order.promoCode ? <Text style={styles.discount}>{t('event.discount', { code: order.promoCode })} · −{formatKzt(order.discountTotal)}</Text> : null}
          {order.feeTotal > 0 ? <Text style={text.muted}>{t('event.fee')} · {formatKzt(order.feeTotal)}</Text> : null}
        </Card>
        {order.status === 'Pending' ? (
          <>
            <Notice tone="warning" message={t('event.demoOnly')} />
            <Button label={busy ? t('event.processing') : t('event.paySuccess')} busy={busy} onPress={() => void simulatePayment('succeeded')} />
            <Button label={t('event.payFail')} variant="secondary" disabled={busy} onPress={() => void simulatePayment('failed')} />
          </>
        ) : (
          <>
            {confirmed && <Button label={t('mobile.showTickets')} onPress={() => router.replace(`/orders/${order.id}`)} />}
            <Button label={t('event.goToTickets')} variant="secondary" onPress={() => router.replace('/tickets')} />
            {confirmed && calendar && <CalendarButtons links={calendar} />}
          </>
        )}
        <ErrorText message={error} />
      </Screen>
    )
  }

  const location = [event.venue, event.venueAddress, event.city].filter(Boolean).join(', ')
  return (
    <Screen>
      <Stack.Screen options={{ title: event.title }} />
      {event.imageUrls?.[0] ? <Image source={{ uri: event.imageUrls[0] }} style={styles.image} accessibilityIgnoresInvertColors /> : null}
      {event.isCancelled && <ErrorText message={t('event.cancelled')} />}
      <Header kicker={`${(event.category || t('event.live')).toUpperCase()}${event.city ? ` · ${event.city.toUpperCase()}` : ''}`} title={event.title} />
      <Card>
        <Row label={t('event.when')} value={`${formatDateTime(event.startDateUtc)}${event.timezone ? ` (${event.timezone})` : ''}`} />
        <Row label={t('event.venue')} value={location} />
        {event.registrationOpensAt ? <Row label={t('event.opens')} value={formatDateTime(event.registrationOpensAt)} /> : null}
        {event.registrationClosesAt ? <Row label={t('event.closes')} value={formatDateTime(event.registrationClosesAt)} /> : null}
      </Card>
      <Text style={text.heading}>{t('event.about')}</Text>
      <Text style={text.body}>{event.description}</Text>
      {event.refundPolicy ? (
        <>
          <Text style={text.heading}>{t('event.refundPolicy')}</Text>
          <Text style={text.body}>{event.refundPolicy}</Text>
        </>
      ) : null}

      {calendar && (
        <Card>
          <Text style={text.subheading}>{t('event.calendar')}</Text>
          <CalendarButtons links={calendar} />
        </Card>
      )}

      <Card style={styles.checkout}>
        <Text style={text.kicker}>{t('event.makeItYours')}</Text>
        <Text style={text.heading}>{assigned ? t('event.chooseSeats') : t('event.chooseTickets')}</Text>
        {assigned && seatMap ? (
          <>
            <Text style={text.muted}>{t('event.seatsHint', { minutes: seatMap.holdMinutes })}</Text>
            <SeatMap map={seatMap} selected={seatIds} limit={MAX_SEATS_PER_ORDER} onToggle={toggleSeat} />
            {seats.length > 0 && (
              <View style={styles.selected}>
                <Text style={text.subheading}>{t('event.seatsSelected')}</Text>
                {seats.map((seat) => (
                  <Row key={seat.seatId} label={t('seatMap.seat', { section: seatSection(seat)?.name ?? '', row: seat.rowLabel, seat: seat.number })} value={seatPrice(seat) ? formatKzt(seatPrice(seat)) : t('event.free')} />
                ))}
              </View>
            )}
          </>
        ) : tickets.length === 0 ? <Text style={text.muted}>{t('event.noTickets')}</Text> : tickets.map((ticket) => {
          const unavailable = ticket.availableQuantity <= 0
          const quantity = quantities[ticket.id] ?? 0
          return (
            <View key={ticket.id} style={styles.ticket}>
              <View style={styles.flex}>
                <Text style={text.subheading}>{ticket.name}</Text>
                <Text style={text.muted}>{ticket.description || t('event.remaining', { count: ticket.availableQuantity })}</Text>
                <Text style={[text.body, styles.price]}>{ticket.price === 0 ? t('event.free') : formatKzt(ticket.price)}</Text>
                {unavailable ? <Text style={styles.unavailable}>{t('event.unavailable')}</Text> : null}
              </View>
              <View style={styles.stepper} accessibilityLabel={t('event.quantityFor', { name: ticket.name })}>
                <Stepper label="−" disabled={quantity === 0} onPress={() => setQuantity(ticket, -1)} />
                <Text style={styles.quantity}>{quantity}</Text>
                <Stepper label="+" disabled={unavailable || quantity >= Math.min(ticket.maxPerOrder, ticket.availableQuantity)} onPress={() => setQuantity(ticket, 1)} />
              </View>
            </View>
          )
        })}

        {(assigned || tickets.length > 0) && !event.isCancelled && (
          <View style={styles.form}>
            <Field label={t('event.promo')} value={promoCode} onChangeText={setPromoCode} placeholder={t('event.optional')} autoCapitalize="characters" />
            {activeQuote?.promoError ? <ErrorText message={activeQuote.promoError} /> : null}
            <Field label={t('event.name')} value={name} onChangeText={setName} maxLength={200} autoComplete="name" />
            <Field label={t('event.email')} value={email} onChangeText={setEmail} maxLength={320} autoCapitalize="none" keyboardType="email-address" />
            {hasPaidTickets && !paidSalesReady && <Notice tone="warning" message={t('event.notActivated')} />}
            {!user && <Text style={text.muted}>{t('event.signInHint')}</Text>}
            <ErrorText message={error} />
            {activeQuote && !activeQuote.promoError && activeQuote.promoCode ? (
              <View>
                <Row label={t('event.subtotal')} value={formatKzt(activeQuote.subtotal)} />
                <Row label={t('event.discount', { code: activeQuote.promoCode })} value={`−${formatKzt(activeQuote.discountTotal)}`} />
                <Row label={t('event.total')} value={formatKzt(activeQuote.total)} strong />
              </View>
            ) : (
              <Row label={t('event.totalBefore')} value={formatKzt(subtotal)} strong />
            )}
            <Button
              label={busy ? t('event.reserving') : subtotal === 0 ? t('event.reserveFree') : t('event.reserve')}
              busy={busy}
              disabled={!hasSelection || !name.trim() || !email.trim() || (hasPaidTickets && !paidSalesReady)}
              onPress={() => void submitCheckout()}
            />
            {hasPaidTickets && paidSalesReady && <Text style={[text.muted, styles.center]}>{t('event.simulationNote')}</Text>}
          </View>
        )}
      </Card>

      {user && (
        <View style={styles.links}>
          <Button label={t('event.help')} variant="ghost" onPress={() => router.push({ pathname: '/support', params: { eventId: event.id, new: '1' } })} />
          <Button label={t('event.report')} variant="ghost" onPress={() => setReportOpen((open) => !open)} />
        </View>
      )}
      {reportMessage ? <Notice message={reportMessage} tone="info" /> : null}
      {reportOpen && (
        <Card style={styles.form}>
          <Select label={t('event.reportReason')} value={reportReason} onChange={setReportReason} options={reportReasons.map((reason) => ({ value: reason.value, label: t(reason.label) }))} />
          <Field label={t('event.reportDetails')} value={reportDetails} onChangeText={setReportDetails} multiline maxLength={2000} />
          <Button label={t('event.reportSend')} onPress={() => void submitReport()} />
        </Card>
      )}
    </Screen>
  )
}

function Stepper({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label === '+' ? '+1' : '−1'} disabled={disabled} onPress={onPress} style={[styles.stepButton, disabled && styles.stepDisabled]}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  )
}

/** One-click calendar options; none of them needs write access to the attendee's calendar (SRS 4.11). */
function CalendarButtons({ links }: { links: CalendarLinks }) {
  const { t } = useLocale()
  const [error, setError] = useState('')
  return (
    <View style={styles.calendar}>
      <Button small variant="secondary" label={t('event.ics')} onPress={() => void shareApiFile(links.icsUrl, `biletflow-${links.eventId}.ics`, 'text/calendar').catch((err: unknown) => setError(errorMessage(err, t('orders.calendarError'))))} />
      {!links.isCancelled && <Button small variant="secondary" label="Google" onPress={() => void Linking.openURL(links.googleCalendarUrl)} />}
      {!links.isCancelled && <Button small variant="secondary" label="Outlook" onPress={() => void Linking.openURL(links.outlookCalendarUrl)} />}
      {error ? <Text style={styles.unavailable}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  image: { height: 200, width: '100%', borderRadius: 16 },
  statusIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusSymbol: { fontSize: 26, fontWeight: '800' },
  discount: { color: colors.success, fontSize: 14 },
  checkout: { gap: 12 },
  selected: { backgroundColor: colors.background, borderRadius: 12, padding: 12, gap: 4 },
  ticket: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 },
  price: { fontWeight: '800', color: colors.ink, marginTop: 4 },
  unavailable: { color: colors.danger, fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepDisabled: { opacity: 0.4 },
  stepText: { fontSize: 20, fontWeight: '700', color: colors.ink },
  quantity: { minWidth: 20, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.ink },
  form: { gap: 12, marginTop: 4 },
  center: { textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
