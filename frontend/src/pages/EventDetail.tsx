import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { API_BASE_URL } from '../api/client'
import { checkout, getEvent, getTicketTypes, payOrder, type EventSummary, type Order, type TicketType } from '../api/events'
import { getCalendarLinks, getQuote, getSeatMap, reportEvent, seatLabel, type CalendarLinks, type Quote, type Seat, type SeatMap as SeatMapData } from '../api/platform'
import { buttonClass, inputClass } from '../components/form'
import { SeatMap } from '../components/SeatMap'
import { useAuth } from '../lib/auth'
import { formatDateTime, formatKzt } from '../lib/format'
import { useLocale } from '../lib/i18n'

const MAX_SEATS_PER_ORDER = 10
const reportReasons = ['Misleading information', 'Suspected fraud', 'Prohibited content', 'Other']

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
  const [promoCode, setPromoCode] = useState(params.get('promoCode') ?? '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
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
          getSeatMap(eventId).then((map) => { if (active) setSeatMap(map) }).catch(() => undefined)
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load this event.')
      })
    // Calendar links are an extra; the page works without them.
    getCalendarLinks(eventId).then((links) => { if (active) setCalendar(links) }).catch(() => undefined)
    return () => { active = false }
  }, [eventId])

  const assigned = seatMap?.seatingMode === 'Assigned'
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
    const timer = window.setTimeout(() => {
      getQuote({ eventId, items: assigned ? [] : selectedItems, seatIds: assigned ? seatIds : undefined, promoCode: appliedPromo || undefined, campaignToken })
        .then((value) => { if (active) setQuote(value) })
        .catch(() => { if (active) setQuote(null) })
    }, 400)
    return () => { active = false; window.clearTimeout(timer) }
  }, [appliedPromo, assigned, campaignToken, eventId, hasSelection, seatIds, selectedItems])
  const activeQuote = hasSelection && (appliedPromo || campaignToken) ? quote : null

  function toggleSeat(seat: Seat) {
    setSeats((current) => current.some((item) => item.seatId === seat.seatId)
      ? current.filter((item) => item.seatId !== seat.seatId)
      : [...current, seat])
  }

  async function submitCheckout() {
    setError('')
    if (!user) {
      navigate('/login', { state: { from: `/events/${eventId}` } })
      return
    }
    setBusy(true)
    try {
      const result = await checkout({
        eventId,
        attendeeName: name.trim(),
        attendeeEmail: email.trim(),
        items: assigned ? [] : selectedItems,
        seatIds: assigned ? seatIds : undefined,
        promoCode: appliedPromo || undefined,
        campaignToken,
      })
      setOrder(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reserve these tickets.')
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
      setError(err instanceof Error ? err.message : 'Payment simulation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitReport(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    setReportMessage('')
    try {
      await reportEvent(eventId, String(data.get('reason')), String(data.get('details')).trim())
      setReportOpen(false)
      setReportMessage(t('event.reportSent'))
    } catch (err) {
      setReportMessage(err instanceof Error ? err.message : 'Could not send the report.')
    }
  }

  if (error && !event) {
    return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</p>
  }
  if (!event) return <p className="text-slate-500">Loading event…</p>

  if (order) {
    const confirmed = order.status === 'Confirmed'
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <div className={`grid size-14 place-items-center rounded-2xl text-2xl ${confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{confirmed ? '✓' : '⌛'}</div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-indigo-600">{t('orders.order')} {order.id.slice(0, 8)}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{confirmed ? t('event.ready') : t('event.reserved')}</h1>
        <p className="mt-3 text-slate-600">{confirmed ? t('event.readyText') : t('event.reservedText', { time: order.expiresAt ? formatDateTime(order.expiresAt) : '—' })}</p>
        <div className="my-6 rounded-2xl bg-slate-50 p-5">
          <div className="flex justify-between text-sm"><span className="text-slate-500">{event.title}</span><span className="font-bold">{formatKzt(order.total)}</span></div>
          {order.items.map((item, index) => <p key={`${item.ticketTypeId}-${index}`} className="mt-2 text-sm text-slate-700">{item.quantity} × {item.ticketTypeName}</p>)}
          {order.promoCode && <p className="mt-2 text-sm text-emerald-700">{t('event.discount', { code: order.promoCode })} · −{formatKzt(order.discountTotal)}</p>}
          {order.feeTotal > 0 && <p className="mt-2 text-sm text-slate-500">{t('event.fee')} · {formatKzt(order.feeTotal)}</p>}
        </div>
        {order.status === 'Pending' ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t('event.demoOnly')}</p>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy} onClick={() => void simulatePayment('succeeded')} className={buttonClass}>{busy ? t('event.processing') : t('event.paySuccess')}</button>
              <button disabled={busy} onClick={() => void simulatePayment('failed')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('event.payFail')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/orders" className={buttonClass}>{t('event.goToTickets')}</Link>
            {confirmed && calendar && <CalendarOptions links={calendar} label={t('event.ics')} />}
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      </section>
    )
  }

  const location = [event.venue, event.venueAddress, event.city].filter(Boolean).join(', ')
  return (
    <div className={`grid gap-7 ${assigned ? '' : 'lg:grid-cols-[minmax(0,1fr)_380px]'}`}>
      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-56 bg-gradient-to-br from-indigo-200 via-violet-100 to-amber-100 sm:h-72">
          {event.imageUrls?.[0] && <img src={event.imageUrls[0]} alt="" className="size-full object-cover" />}
          <Link to="/events" className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">{t('event.all')}</Link>
        </div>
        <div className="p-6 sm:p-9">
          {event.isCancelled && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{t('event.cancelled')}</p>}
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">{event.category || t('event.live')}{event.city ? ` · ${event.city}` : ''}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{event.title}</h1>
          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{t('event.when')}</span><span className="mt-1 block font-semibold text-slate-800">{formatDateTime(event.startDateUtc)}{event.timezone ? ` (${event.timezone})` : ''}</span></p>
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{t('event.venue')}</span><span className="mt-1 block font-semibold text-slate-800">{location}</span></p>
            {event.registrationOpensAt && <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{t('event.opens')}</span><span className="mt-1 block font-semibold">{formatDateTime(event.registrationOpensAt)}</span></p>}
            {event.registrationClosesAt && <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{t('event.closes')}</span><span className="mt-1 block font-semibold">{formatDateTime(event.registrationClosesAt)}</span></p>}
          </div>
          <h2 className="mt-8 text-lg font-bold">{t('event.about')}</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{event.description}</p>
          {event.refundPolicy && <><h2 className="mt-8 text-lg font-bold">{t('event.refundPolicy')}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{event.refundPolicy}</p></>}

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
            {calendar && <><span className="text-sm font-semibold text-slate-700">{t('event.calendar')}:</span><CalendarOptions links={calendar} label={t('event.ics')} /></>}
            {user && <Link to={`/support?eventId=${event.id}&new=1`} className="ml-auto text-sm font-semibold text-indigo-700 hover:underline">{t('event.help')}</Link>}
            {user && <button onClick={() => setReportOpen((open) => !open)} className="text-sm font-semibold text-slate-500 hover:underline">{t('event.report')}</button>}
          </div>
          {reportMessage && <p role="status" className="mt-3 text-sm text-slate-600">{reportMessage}</p>}
          {reportOpen && (
            <form onSubmit={(form) => void submitReport(form)} className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-4">
              <label className="block text-sm font-medium">{t('event.reportReason')}<select name="reason" className={`${inputClass} mt-1.5`}>{reportReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
              <label className="block text-sm font-medium">{t('event.reportDetails')}<textarea name="details" rows={3} maxLength={2000} className={`${inputClass} mt-1.5`} /></label>
              <button className={buttonClass}>{t('event.reportSend')}</button>
            </form>
          )}
        </div>
      </article>

      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-indigo-600">{t('event.makeItYours')}</p>
        <h2 className="mt-1 text-xl font-bold">{assigned ? t('event.chooseSeats') : t('event.chooseTickets')}</h2>
        <div className={assigned ? 'mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]' : ''}>
          {assigned && seatMap ? (
            <div>
              <p className="mb-4 text-xs text-slate-500">{t('event.seatsHint', { minutes: seatMap.holdMinutes })}</p>
              <SeatMap map={seatMap} selected={seatIds} limit={MAX_SEATS_PER_ORDER} onToggle={toggleSeat} />
            </div>
          ) : tickets.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t('event.noTickets')}</p> : (
            <div className="mt-5 space-y-3">
              {tickets.map((ticket) => {
                const unavailable = ticket.availableQuantity <= 0
                return (
                  <div key={ticket.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="font-bold">{ticket.name}</h3><p className="mt-1 text-sm text-slate-500">{ticket.description || t('event.remaining', { count: ticket.availableQuantity })}</p><p className="mt-2 font-bold text-slate-900">{ticket.price === 0 ? t('event.free') : formatKzt(ticket.price)}</p></div>
                      <select aria-label={`Quantity for ${ticket.name}`} disabled={Boolean(unavailable)} value={quantities[ticket.id] ?? 0} onChange={(change) => setQuantities((current) => ({ ...current, [ticket.id]: Number(change.target.value) }))} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
                        {Array.from({ length: Math.min(ticket.maxPerOrder, ticket.availableQuantity) + 1 }, (_, quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
                      </select>
                    </div>
                    {unavailable && <p className="mt-2 text-xs text-rose-600">{t('event.unavailable')}</p>}
                  </div>
                )
              })}
            </div>
          )}
          {(assigned || tickets.length > 0) && (
            <div className={`space-y-4 ${assigned ? '' : 'mt-5 border-t border-slate-100 pt-5'}`}>
              {assigned && seats.length > 0 && (
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-semibold">{t('event.seatsSelected')}</p>
                  <ul className="mt-1 space-y-1 text-slate-600">{seats.map((seat) => <li key={seat.seatId} className="flex justify-between gap-3"><span>{seatLabel(seatSection(seat)?.name ?? '', seat)}</span><span>{seatPrice(seat) ? formatKzt(seatPrice(seat)) : t('event.free')}</span></li>)}</ul>
                </div>
              )}
              <label className="block text-sm font-medium text-slate-700">{t('event.promo')}
                <input value={promoCode} onChange={(change) => setPromoCode(change.target.value)} placeholder={t('event.optional')} className={`${inputClass} mt-1.5`} />
              </label>
              {activeQuote?.promoError && <p role="alert" className="text-sm text-rose-700">{activeQuote.promoError}</p>}
              <label className="block text-sm font-medium text-slate-700">{t('event.name')}
                <input value={name} onChange={(change) => setName(change.target.value)} maxLength={200} className={`${inputClass} mt-1.5`} />
              </label>
              <label className="block text-sm font-medium text-slate-700">{t('event.email')}
                <input type="email" value={email} onChange={(change) => setEmail(change.target.value)} maxLength={320} className={`${inputClass} mt-1.5`} />
              </label>
              {hasPaidTickets && !paidSalesReady && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t('event.notActivated')}</p>}
              {!user && <p className="text-xs text-slate-500">{t('event.signInHint')}</p>}
              {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
              {activeQuote && !activeQuote.promoError && activeQuote.promoCode ? (
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">{t('event.subtotal')}</dt><dd>{formatKzt(activeQuote.subtotal)}</dd></div>
                  <div className="flex justify-between text-emerald-700"><dt>{t('event.discount', { code: activeQuote.promoCode })}</dt><dd>−{formatKzt(activeQuote.discountTotal)}</dd></div>
                  <div className="flex justify-between font-bold"><dt>{t('event.total')}</dt><dd>{formatKzt(activeQuote.total)}</dd></div>
                </dl>
              ) : (
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t('event.totalBefore')}</span><span className="font-bold">{formatKzt(subtotal)}</span></div>
              )}
              <button disabled={busy || !hasSelection || !name.trim() || !email.trim() || (hasPaidTickets && !paidSalesReady)} onClick={() => void submitCheckout()} className={`${buttonClass} w-full`}>
                {busy ? t('event.reserving') : subtotal === 0 ? t('event.reserveFree') : t('event.reserve')}
              </button>
              {hasPaidTickets && paidSalesReady && <p className="text-center text-xs leading-5 text-slate-400">{t('event.simulationNote')}</p>}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

/** One-click calendar options; none of them needs write access to the attendee's calendar (SRS 4.11). */
function CalendarOptions({ links, label }: { links: CalendarLinks; label: string }) {
  const linkClass = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
  return (
    <>
      <a href={`${API_BASE_URL}${links.icsUrl}`} download className={linkClass}>{label}</a>
      {!links.isCancelled && <a href={links.googleCalendarUrl} target="_blank" rel="noreferrer" className={linkClass}>Google</a>}
      {!links.isCancelled && <a href={links.outlookCalendarUrl} target="_blank" rel="noreferrer" className={linkClass}>Outlook</a>}
    </>
  )
}
