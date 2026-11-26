import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { cancelOrder, checkout, getEvent, getTicketTypes, payOrder, type EventSummary, type Order, type TicketType } from '../api/events'
import { getCalendarLinks, getQuote, getSeatMap, type CalendarLinks, type Quote, type Seat, type SeatMap as SeatMapData } from '../api/platform'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'
import { CheckoutStep, OrderClosed, PaymentFailed } from './event/Checkout'
import { OrderConfirmed } from './event/Confirmed'
import type { Flow, Step } from './event/flow'
import { EventOverview } from './event/Overview'
import { SeatStep } from './event/Seats'

/**
 * The event page and its purchase flow: overview → seats (assigned seating only) → details and
 * payment → confirmation. The steps share one component so the selection survives moving between them.
 */
export default function EventDetail() {
  const { eventId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useLocale()
  const linkToken = params.get('campaignToken') ?? undefined
  const linkPromo = params.get('promoCode') ?? ''
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
  const [step, setStep] = useState<Step>('select')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [seatMapError, setSeatMapError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([getEvent(eventId), getTicketTypes(eventId)])
      .then(([eventInfo, ticketTypes]) => {
        if (!active) return
        setEvent(eventInfo)
        setTickets(ticketTypes)
        // The seat map only exists for assigned-seating events.
        if (eventInfo.seatingMode === 'Assigned') {
          setSeatMapError('')
          getSeatMap(eventId)
            .then((map) => { if (active) setSeatMap(map) })
            .catch((err: unknown) => { if (active) setSeatMapError(err instanceof Error ? err.message : t('event.loadError')) })
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t('event.loadError'))
      })
    // Calendar links are an extra; the page works without them.
    getCalendarLinks(eventId).then((links) => { if (active) setCalendar(links) }).catch(() => undefined)
    return () => { active = false }
  }, [eventId, t])

  const isAssignedMode = event?.seatingMode === 'Assigned'
  const assigned = isAssignedMode && seatMap?.seatingMode === 'Assigned'
  const selectedItems = useMemo(() => tickets
    .filter((ticket) => (quantities[ticket.id] ?? 0) > 0)
    .map((ticket) => ({ ticketTypeId: ticket.id, quantity: quantities[ticket.id] })), [quantities, tickets])
  const seatIds = useMemo(() => seats.map((seat) => seat.seatId), [seats])
  const seatSection = (seat: Seat) => seatMap?.sections.find((section) => section.seats.some((item) => item.seatId === seat.seatId))
  const seatPrice = (seat: Seat) => seatSection(seat)?.price ?? 0
  const lines = assigned
    ? seats.map((seat) => ({ label: t('seatMap.seat', { section: seatSection(seat)?.name ?? '', row: seat.rowLabel, seat: seat.number }), amount: seatPrice(seat) }))
    : tickets.filter((ticket) => (quantities[ticket.id] ?? 0) > 0).map((ticket) => ({ label: `${ticket.name} × ${quantities[ticket.id]}`, amount: ticket.price * quantities[ticket.id] }))
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0)
  const hasSelection = assigned ? seats.length > 0 : selectedItems.length > 0
  const typedPromo = promoCode.trim()
  // The API accepts a campaign link or a typed promo code, never both. The link wins while its
  // pre-filled code is untouched; editing the field switches to the typed code.
  const campaignToken = linkToken && typedPromo === linkPromo ? linkToken : undefined
  const appliedPromo = campaignToken ? '' : typedPromo

  // The server prices the order and validates the promo code; the client never trusts its own discount.
  useEffect(() => {
    if (!hasSelection || (!appliedPromo && !campaignToken)) return
    let active = true
    const timer = window.setTimeout(() => {
      getQuote({ eventId, items: assigned ? [] : selectedItems, seatIds: assigned ? seatIds : undefined, promoCode: appliedPromo || undefined, campaignToken })
        .then((value) => { if (active) setQuote(value) })
        .catch(() => { if (active) setQuote(null) })
    }, 400)
    return () => { active = false; window.clearTimeout(timer) }
  }, [appliedPromo, assigned, campaignToken, eventId, hasSelection, seatIds, selectedItems])
  const activeQuote = hasSelection && (appliedPromo || campaignToken) ? quote : null

  function goTo(next: Step) {
    setError('')
    // Checkout needs an account; come back to this event after signing in.
    if (next === 'details' && !user) {
      void navigate('/login', { state: { from: `/events/${eventId}` } })
      return
    }
    setStep(next)
    window.scrollTo({ top: 0 })
  }

  async function reserve() {
    setError('')
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
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('event.reserveError'))
      // Someone else may have taken a seat in the meantime: show the current map.
      if (assigned) {
        setSeats([])
        getSeatMap(eventId).then(setSeatMap).catch(() => undefined)
      }
    } finally {
      setBusy(false)
    }
  }

  async function pay(outcome: 'succeeded' | 'failed') {
    if (!order) return
    setError('')
    setBusy(true)
    try {
      setOrder(await payOrder(order.id, outcome))
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('event.payError'))
    } finally {
      setBusy(false)
    }
  }

  async function cancelReservation() {
    if (!order) return
    setError('')
    setBusy(true)
    try {
      await cancelOrder(order.id)
      setOrder(null)
      setStep('select')
      if (assigned) {
        setSeats([])
        getSeatMap(eventId).then(setSeatMap).catch(() => undefined)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('event.payError'))
    } finally {
      setBusy(false)
    }
  }

  if (error && !event) {
    return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</p></div>
  }
  if (!event) return <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><p className="text-slate-500">{t('event.loading')}</p></div>

  const flow: Flow = {
    event, tickets, seatMap, seatMapError, calendar, isAssignedMode, assigned,
    quantities, setQuantity: (id, quantity) => setQuantities((current) => ({ ...current, [id]: quantity })),
    seats, toggleSeat: (seat) => setSeats((current) => current.some((item) => item.seatId === seat.seatId) ? current.filter((item) => item.seatId !== seat.seatId) : [...current, seat]),
    clearSeats: () => setSeats([]),
    seatSectionName: (seat) => seatSection(seat)?.name ?? '',
    seatPrice, lines, subtotal, hasSelection,
    hasPaidTickets: subtotal > 0,
    paidSalesReady: event.paidSalesStatus === 'Active',
    promoCode, setPromoCode, quote: activeQuote,
    name, setName, email, setEmail,
    order, busy, error, setError,
    signedIn: !!user,
    goTo, reserve, pay, cancelReservation,
  }

  const container = 'mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8'
  if (order) {
    if (order.status === 'Confirmed') return <div className={container}><OrderConfirmed flow={flow} order={order} /></div>
    if (order.status === 'Pending' && order.paymentStatus === 'Failed') return <div className={container}><PaymentFailed flow={flow} order={order} /></div>
    if (order.status !== 'Pending') return <div className={container}><OrderClosed order={order} /></div>
  }
  if (order || step === 'details') return <div className={container}><CheckoutStep flow={flow} /></div>
  if (step === 'seats') return <div className={container}><SeatStep flow={flow} /></div>
  return <EventOverview flow={flow} />
}
