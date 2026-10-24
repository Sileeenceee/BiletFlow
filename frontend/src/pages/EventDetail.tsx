import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { checkout, getEvent, getTicketTypes, payOrder, type EventSummary, type Order, type TicketType } from '../api/events'
import { buttonClass, inputClass } from '../components/form'
import { useAuth } from '../lib/auth'
import { formatDateTime, formatKzt } from '../lib/format'

export default function EventDetail() {
  const { eventId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const campaignToken = params.get('campaignToken') ?? undefined
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [promoCode, setPromoCode] = useState(params.get('promoCode') ?? '')
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([getEvent(eventId), getTicketTypes(eventId)])
      .then(([eventInfo, ticketTypes]) => {
        if (!active) return
        setEvent(eventInfo)
        setTickets(ticketTypes)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load this event.')
      })
    return () => { active = false }
  }, [eventId])

  const total = useMemo(() => tickets.reduce((sum, ticket) => {
    return sum + ticket.price * (quantities[ticket.id] ?? 0)
  }, 0), [quantities, tickets])
  const selectedItems = tickets
    .filter((ticket) => (quantities[ticket.id] ?? 0) > 0)
    .map((ticket) => ({ ticketTypeId: ticket.id, quantity: quantities[ticket.id] }))
  const hasPaidTickets = selectedItems.some((item) => {
    const ticket = tickets.find((candidate) => candidate.id === item.ticketTypeId)
    return Boolean(ticket && ticket.price > 0)
  })
  const paidSalesReady = event?.paidSalesStatus === 'Active'

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
        items: selectedItems,
        promoCode: promoCode.trim() || undefined,
        campaignToken,
      })
      setOrder(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reserve these tickets.')
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

  if (error && !event) {
    return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</p>
  }
  if (!event) return <p className="text-slate-500">Loading event…</p>

  if (order) {
    const confirmed = order.status === 'Confirmed'
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <div className={`grid size-14 place-items-center rounded-2xl text-2xl ${confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{confirmed ? '✓' : '⌛'}</div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-indigo-600">Order {order.id.slice(0, 8)}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{confirmed ? 'Your tickets are ready!' : 'Your tickets are reserved'}</h1>
        <p className="mt-3 text-slate-600">{confirmed ? 'Your booking is confirmed. You can view or download your tickets from your account.' : `Complete the clearly labelled payment simulation before ${order.expiresAt ? formatDateTime(order.expiresAt) : 'your reservation expires'}. No real payment is collected.`}</p>
        <div className="my-6 rounded-2xl bg-slate-50 p-5">
          <div className="flex justify-between text-sm"><span className="text-slate-500">{event.title}</span><span className="font-bold">{formatKzt(order.total)}</span></div>
          {order.items.map((item) => <p key={item.ticketTypeId} className="mt-2 text-sm text-slate-700">{item.quantity} × {item.ticketTypeName}</p>)}
          {order.promoCode && <p className="mt-2 text-sm text-emerald-700">Promo {order.promoCode} · −{formatKzt(order.discountTotal)}</p>}
        </div>
        {order.status === 'Pending' ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Demo only: these buttons simulate a payment outcome. Do not enter real card details.</p>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy} onClick={() => void simulatePayment('succeeded')} className={buttonClass}>{busy ? 'Processing…' : 'Simulate successful payment'}</button>
              <button disabled={busy} onClick={() => void simulatePayment('failed')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Simulate failed payment</button>
            </div>
          </div>
        ) : (
          <Link to="/orders" className={buttonClass}>Go to my tickets</Link>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      </section>
    )
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px]">
      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-56 bg-gradient-to-br from-indigo-200 via-violet-100 to-amber-100 sm:h-72">
          {event.imageUrls?.[0] && <img src={event.imageUrls[0]} alt="" className="size-full object-cover" />}
          <Link to="/events" className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">← All events</Link>
        </div>
        <div className="p-6 sm:p-9">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">{event.category || 'Live event'}{event.city ? ` · ${event.city}` : ''}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{event.title}</h1>
          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Date and time</span><span className="mt-1 block font-semibold text-slate-800">{formatDateTime(event.startDateUtc)}</span></p>
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Venue</span><span className="mt-1 block font-semibold text-slate-800">{event.venue}{event.city ? `, ${event.city}` : ''}</span></p>
            {event.registrationOpensAt && <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Registration opens</span><span className="mt-1 block font-semibold">{formatDateTime(event.registrationOpensAt)}</span></p>}
            {event.registrationClosesAt && <p><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Registration closes</span><span className="mt-1 block font-semibold">{formatDateTime(event.registrationClosesAt)}</span></p>}
          </div>
          <h2 className="mt-8 text-lg font-bold">About this event</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{event.description}</p>
        </div>
      </article>

      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-indigo-600">Make it yours</p>
        <h2 className="mt-1 text-xl font-bold">Choose tickets</h2>
        {tickets.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Tickets are not available yet.</p> : (
          <div className="mt-5 space-y-3">
            {tickets.map((ticket) => {
              const unavailable = ticket.availableQuantity <= 0
              return (
                <div key={ticket.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-bold">{ticket.name}</h3><p className="mt-1 text-sm text-slate-500">{ticket.description || `${ticket.availableQuantity} remaining`}</p><p className="mt-2 font-bold text-slate-900">{ticket.price === 0 ? 'Free' : formatKzt(ticket.price)}</p></div>
                    <select aria-label={`Quantity for ${ticket.name}`} disabled={Boolean(unavailable)} value={quantities[ticket.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [ticket.id]: Number(event.target.value) }))} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
                      {Array.from({ length: Math.min(ticket.maxPerOrder, ticket.availableQuantity) + 1 }, (_, quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
                    </select>
                  </div>
                  {unavailable && <p className="mt-2 text-xs text-rose-600">Currently unavailable</p>}
                </div>
              )
            })}
          </div>
        )}
        {tickets.length > 0 && (
          <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
            <label className="block text-sm font-medium text-slate-700">Promo code
              <input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Optional" className={`${inputClass} mt-1.5`} />
            </label>
            <label className="block text-sm font-medium text-slate-700">Attendee name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} className={`${inputClass} mt-1.5`} />
            </label>
            <label className="block text-sm font-medium text-slate-700">Email for tickets
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} className={`${inputClass} mt-1.5`} />
            </label>
            {hasPaidTickets && !paidSalesReady && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Paid ticket sales have not been activated for this event. Contact the organizer.</p>}
            {!user && <p className="text-xs text-slate-500">Sign in to reserve tickets and keep them in your account.</p>}
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <div className="flex justify-between text-sm"><span className="text-slate-500">Total before discounts</span><span className="font-bold">{formatKzt(total)}</span></div>
            <button disabled={busy || selectedItems.length === 0 || !name.trim() || !email.trim() || (hasPaidTickets && !paidSalesReady)} onClick={() => void submitCheckout()} className={`${buttonClass} w-full`}>
              {busy ? 'Reserving…' : total === 0 ? 'Reserve free tickets' : 'Reserve tickets'}
            </button>
            {hasPaidTickets && paidSalesReady && <p className="text-center text-xs leading-5 text-slate-400">The following payment step is a simulation; no actual payment will be taken.</p>}
          </div>
        )}
      </aside>
    </div>
  )
}
