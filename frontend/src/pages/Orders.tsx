import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getMyOrders, payOrder, cancelOrder, type Order } from '../api/events'
import { apiBlob } from '../api/client'
import { saveBlob, formatDateTime, formatKzt } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'

function downloadTicket(ticketId: string, kind: 'pdf' | 'qr') {
  return apiBlob(`/api/tickets/${ticketId}/${kind}`).then((blob) => {
    saveBlob(blob, `biletflow-ticket-${ticketId}.${kind === 'pdf' ? 'pdf' : 'png'}`)
  })
}

/** The server builds the .ics so it carries the stable UID, time zone and cancellation state (SRS 4.11). */
function downloadCalendar(order: Order) {
  return apiBlob(`/api/events/${order.eventId}/calendar.ics`).then((blob) => {
    saveBlob(blob, `biletflow-${order.eventId}.ics`)
  })
}

const orderStatusKeys: Record<string, MessageKey> = {
  Pending: 'orders.status.Pending',
  Confirmed: 'orders.status.Confirmed',
  Cancelled: 'orders.status.Cancelled',
  Refunded: 'orders.status.Refunded',
}

const ticketStatusKeys: Record<string, MessageKey> = {
  Valid: 'orders.ticketStatus.Valid',
  CheckedIn: 'orders.ticketStatus.CheckedIn',
  Cancelled: 'orders.ticketStatus.Cancelled',
  Refunded: 'orders.ticketStatus.Refunded',
}

export default function Orders() {
  const { t } = useLocale()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyTicket, setBusyTicket] = useState('')
  const [busyOrder, setBusyOrder] = useState('')

  useEffect(() => {
    getMyOrders().then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('orders.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  async function download(ticketId: string, kind: 'pdf' | 'qr') {
    setBusyTicket(ticketId)
    setError('')
    try {
      await downloadTicket(ticketId, kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('orders.downloadError'))
    } finally {
      setBusyTicket('')
    }
  }

  async function updatePending(orderId: string, action: 'pay' | 'cancel') {
    setBusyOrder(orderId)
    setError('')
    try {
      const updated = action === 'pay'
        ? await payOrder(orderId, 'succeeded')
        : await cancelOrder(orderId)
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order))
    } catch (err) {
      setError(err instanceof Error ? err.message : t(action === 'pay' ? 'orders.payError' : 'orders.cancelError'))
    } finally {
      setBusyOrder('')
    }
  }

  if (loading) return <p className="text-slate-500">{t('orders.loading')}</p>
  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-semibold text-indigo-600">{t('orders.kicker')}</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">{t('orders.title')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('orders.subtitle')}</p>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {orders.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-xl font-bold">{t('orders.emptyTitle')}</h2>
          <p className="mt-2 text-sm text-slate-500">{t('orders.emptyText')}</p>
          <Link to="/events" className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">{t('orders.explore')}</Link>
        </section>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
                <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{formatDateTime(order.createdAt)}</p><h2 className="mt-1 text-xl font-bold">{order.eventTitle}</h2><p className="mt-1 text-sm text-slate-500">{t('orders.order')} #{order.id.slice(0, 8)}</p></div>
                <div className="text-right"><span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' : order.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{orderStatusKeys[order.status] ? t(orderStatusKeys[order.status]) : order.status}</span><p className="mt-2 font-bold">{formatKzt(order.total)}</p>{Boolean(order.refundTotal) && <p className="mt-1 text-xs text-slate-500">{t('orders.refunded', { amount: formatKzt(order.refundTotal ?? 0) })}</p>}</div>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                {order.items.map((item, index) => (
                  <div key={`${item.ticketTypeId}-${index}`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
                    <div><p className="font-semibold">{item.ticketTypeName}</p><p className="mt-1 text-sm text-slate-500">{t(item.quantity === 1 ? 'orders.ticketCountOne' : 'orders.ticketCount', { count: item.quantity })}</p></div>
                    <div className="flex flex-wrap gap-2">
                      {item.tickets.map((ticket) => {
                        const downloadable = ticket.status !== 'Cancelled' && ticket.status !== 'Refunded'
                        return (
                          <div key={ticket.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2">
                            {ticket.qrCodeDataUri && <img src={ticket.qrCodeDataUri} alt={t('orders.qrAlt', { name: ticket.ticketTypeName })} className="size-14 rounded-lg border border-slate-100 p-1" />}
                            <span className="mr-1 text-xs text-slate-500">{ticketStatusKeys[ticket.status] ? t(ticketStatusKeys[ticket.status]) : ticket.status}{ticket.seatNumber ? ` · ${t('orders.seat', { section: ticket.sectionName ?? '', row: ticket.rowLabel ?? '', seat: ticket.seatNumber })}` : ''}</span>
                            {downloadable && (
                              <>
                                <button disabled={busyTicket === ticket.id} onClick={() => void download(ticket.id, 'pdf')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">{busyTicket === ticket.id ? '…' : t('orders.pdf')}</button>
                                <button disabled={busyTicket === ticket.id} onClick={() => void download(ticket.id, 'qr')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t('orders.qr')}</button>
                              </>
                            )}
                            <Link to={`/support?orderId=${order.id}&ticketId=${ticket.id}&eventId=${order.eventId}&new=1`} aria-label={`${t('orders.help')} ${ticket.code}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">?</Link>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => void downloadCalendar(order).catch((err: unknown) => setError(err instanceof Error ? err.message : t('orders.calendarError')))} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('orders.calendar')}</button>
                  {order.status === 'Pending' && <><button disabled={busyOrder === order.id} onClick={() => void updatePending(order.id, 'pay')} className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">{busyOrder === order.id ? t('orders.working') : t('event.paySuccess')}</button><button disabled={busyOrder === order.id} onClick={() => void updatePending(order.id, 'cancel')} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t('orders.cancel')}</button></>}
                  <Link to={`/support?orderId=${order.id}&eventId=${order.eventId}&new=1`} className="ml-auto text-sm font-semibold text-indigo-700 hover:underline">{t('orders.help')}</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
