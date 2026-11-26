import { useState } from 'react'
import { Link } from 'react-router'
import { apiBlob } from '../api/client'
import { cancelOrder, payOrder, type EventSummary, type Order, type Ticket } from '../api/events'
import { AccountNav } from '../components/AccountNav'
import { Badge, EventArt } from '../components/EventCard'
import { DownloadIcon } from '../components/icons'
import { formatDate, formatEventDate, formatKzt, orderCode, saveBlob } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'
import { useMyTickets } from './tickets/useMyTickets'

type Tone = 'green' | 'amber' | 'cyan' | 'rose' | 'slate'

const ticketStatus: Record<string, { label: MessageKey; tone: Tone }> = {
  Valid: { label: 'orders.ticketStatus.Valid', tone: 'green' },
  CheckedIn: { label: 'orders.ticketStatus.CheckedIn', tone: 'cyan' },
  Cancelled: { label: 'orders.ticketStatus.Cancelled', tone: 'slate' },
  Refunded: { label: 'orders.ticketStatus.Refunded', tone: 'amber' },
}

function orderStatus(order: Order): { label: MessageKey; tone: Tone } {
  switch (order.status) {
    case 'Confirmed': return { label: order.total > 0 ? 'orders.paid' : 'orders.freeRegistration', tone: 'green' }
    case 'Pending': return { label: order.paymentStatus === 'Failed' ? 'orders.paymentFailed' : 'orders.status.Pending', tone: 'amber' }
    case 'Refunded': return { label: 'orders.status.Refunded', tone: 'amber' }
    default: return { label: 'orders.status.Cancelled', tone: 'slate' }
  }
}

/** One status for a ticket row: valid while any ticket is still usable. */
function rowStatus(tickets: Ticket[]) {
  const status = tickets.find((ticket) => ticket.status === 'Valid')?.status ?? tickets[0]?.status ?? 'Cancelled'
  return ticketStatus[status] ?? { label: 'orders.ticketStatus.Cancelled' as MessageKey, tone: 'slate' as Tone }
}

export default function Orders() {
  const { t } = useLocale()
  const { orders, setOrders, events, loading, error, setError, loadedAt } = useMyTickets()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [busy, setBusy] = useState('')

  async function downloadPdf(ticket: Ticket) {
    setBusy(ticket.id)
    setError('')
    try {
      saveBlob(await apiBlob(`/api/tickets/${ticket.id}/pdf`), `biletflow-ticket-${ticket.code}.pdf`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('orders.downloadError'))
    } finally {
      setBusy('')
    }
  }

  async function updatePending(orderId: string, action: 'pay' | 'cancel') {
    setBusy(orderId)
    setError('')
    try {
      const updated = action === 'pay' ? await payOrder(orderId, 'succeeded') : await cancelOrder(orderId)
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order))
    } catch (err) {
      setError(err instanceof Error ? err.message : t(action === 'pay' ? 'orders.payError' : 'orders.cancelError'))
    } finally {
      setBusy('')
    }
  }

  if (loading) return <p className="text-slate-500">{t('orders.loading')}</p>

  const withTickets = orders.filter((order) => order.items.some((item) => item.tickets.length > 0))
  const isPast = (order: Order) => {
    const event = events[order.eventId]
    return !!event && new Date(event.endDateUtc || event.startDateUtc).getTime() < loadedAt
  }
  const upcoming = withTickets.filter((order) => !isPast(order))
  const past = withTickets.filter(isPast)
  const shown = tab === 'upcoming' ? upcoming : past
  const pending = orders.filter((order) => order.status === 'Pending')

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
      <AccountNav />
      <div className="min-w-0">
        <h1 className="font-display text-[38px] font-bold tracking-tight text-slate-900">{t('orders.title')}</h1>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

        {pending.length > 0 && (
          <section className="mt-6 space-y-3" aria-label={t('orders.awaitingPayment')}>
            {pending.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#FBBF24]/60 bg-[#FEF3C7] px-6 py-4">
                <div>
                  <p className="font-bold text-slate-900">{t('orders.awaitingTitle', { event: order.eventTitle })}</p>
                  <p className="text-sm text-slate-700">{t('orders.awaitingText', { amount: formatKzt(order.total), code: orderCode(order) })}</p>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy === order.id} onClick={() => void updatePending(order.id, 'pay')} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy === order.id ? t('orders.working') : t('event.paySuccess')}</button>
                  <button disabled={busy === order.id} onClick={() => void updatePending(order.id, 'cancel')} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50">{t('orders.cancel')}</button>
                </div>
              </div>
            ))}
          </section>
        )}

        <div role="tablist" className="mt-6 flex gap-8 border-b border-slate-200">
          {(['upcoming', 'past'] as const).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px border-b-2 pb-3 text-[15px] transition ${tab === key ? 'border-brand-500 font-bold text-brand-500' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
              {t(key === 'upcoming' ? 'orders.upcoming' : 'orders.past', { count: (key === 'upcoming' ? upcoming : past).length })}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="font-display text-xl font-bold text-slate-900">{t(tab === 'upcoming' ? 'orders.emptyTitle' : 'orders.noPast')}</h2>
            {tab === 'upcoming' && <p className="mt-2 text-sm text-slate-500">{t('orders.emptyText')}</p>}
            {tab === 'upcoming' && <Link to="/events" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand-500 px-5 text-sm font-bold text-white">{t('orders.explore')}</Link>}
          </section>
        ) : (
          <ul className="mt-6 space-y-4">
            {shown.map((order) => <TicketRow key={order.id} order={order} event={events[order.eventId]} busy={busy} onPdf={downloadPdf} />)}
          </ul>
        )}

        {orders.length > 0 && (
          <section id="orders" className="mt-12 scroll-mt-28">
            <h2 className="font-display text-[26px] font-bold text-slate-900">{t('account.orders')}</h2>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] text-left text-[15px]">
                <thead className="bg-[#F1F5F9] text-sm text-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-bold">{t('orders.order')}</th>
                    <th className="px-4 py-3 font-bold">{t('orders.event')}</th>
                    <th className="px-4 py-3 font-bold">{t('orders.date')}</th>
                    <th className="px-4 py-3 font-bold">{t('event.total')}</th>
                    <th className="px-4 py-3 font-bold">{t('orders.statusLabel')}</th>
                    <th className="px-4 py-3"><span className="sr-only">{t('orders.details')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {orders.map((order) => {
                    const status = orderStatus(order)
                    const first = order.items.flatMap((item) => item.tickets)[0]
                    return (
                      <tr key={order.id}>
                        <td className="px-4 py-4 font-mono text-sm font-bold text-slate-900">{orderCode(order)}</td>
                        <td className="px-4 py-4 text-slate-800">{order.eventTitle}</td>
                        <td className="px-4 py-4 text-slate-600">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-4 text-slate-800">
                          {order.total === 0 ? t('event.free') : formatKzt(order.total)}
                          {Boolean(order.refundTotal) && <span className="block text-xs text-slate-500">{t('orders.refunded', { amount: formatKzt(order.refundTotal ?? 0) })}</span>}
                        </td>
                        <td className="px-4 py-4"><Badge tone={status.tone}>{t(status.label)}</Badge></td>
                        <td className="px-4 py-4 text-right">
                          <Link to={first ? `/tickets/${first.id}` : `/events/${order.eventId}`} className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('orders.details')}</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function TicketRow({ order, event, busy, onPdf }: { order: Order; event: EventSummary | null | undefined; busy: string; onPdf: (ticket: Ticket) => void }) {
  const { t } = useLocale()
  const tickets = order.items.flatMap((item) => item.tickets)
  const first = tickets[0]
  const status = rowStatus(tickets)
  const usable = tickets.find((ticket) => ticket.status === 'Valid' || ticket.status === 'CheckedIn')
  const seats = tickets.filter((ticket) => ticket.rowLabel).map((ticket) => t('orders.seat', { section: ticket.sectionName ?? '', row: ticket.rowLabel ?? '', seat: ticket.seatNumber ?? '' }))
  const art: EventSummary = event ?? { id: order.eventId, title: order.eventTitle, description: '', venue: '', city: '', cityId: 0, startDateUtc: '', endDateUtc: '', isPublished: true }
  return (
    <li className="flex flex-wrap items-center gap-5 rounded-2xl border border-slate-200 bg-white p-4">
      <EventArt event={art} className="h-[88px] w-[120px] shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-bold text-slate-900">{order.eventTitle}</h3>
        {event && <p className="text-sm text-slate-600">{formatEventDate(event.startDateUtc, event.timezone)}</p>}
        <p className="text-sm text-slate-800">{seats.length ? seats.join('; ') : order.items.map((item) => `${item.ticketTypeName} × ${item.quantity}`).join(', ')}</p>
        <div className="mt-1.5"><Badge tone={status.tone}>{t(status.label)}</Badge></div>
      </div>
      {first && (
        <div className="flex gap-3">
          <Link to={`/tickets/${(usable ?? first).id}`} className="inline-flex h-11 items-center rounded-lg bg-brand-500 px-6 text-sm font-bold text-white hover:bg-brand-600">{t('orders.viewTicket')}</Link>
          {usable && (
            <button type="button" disabled={busy === usable.id} onClick={() => onPdf(usable)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50">
              <DownloadIcon className="size-4" />{busy === usable.id ? '…' : 'PDF'}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
