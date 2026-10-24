import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getEvent, getMyOrders, payOrder, cancelOrder, type Order } from '../api/events'
import { apiBlob } from '../api/client'
import { saveBlob, formatDateTime, formatKzt } from '../lib/format'

function downloadTicket(ticketId: string, kind: 'pdf' | 'qr') {
  return apiBlob(`/api/tickets/${ticketId}/${kind}`).then((blob) => {
    saveBlob(blob, `biletflow-ticket-${ticketId}.${kind === 'pdf' ? 'pdf' : 'png'}`)
  })
}

async function downloadCalendar(order: Order) {
  const event = await getEvent(order.eventId)
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
  const formatUtc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiletFlow//Event Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${order.eventId}@biletflow`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${formatUtc(event.startDateUtc)}`,
    `DTEND:${formatUtc(event.endDateUtc)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(`${event.venue}, ${event.city}`)}`,
    `DESCRIPTION:${escape(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  saveBlob(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }), `biletflow-${order.eventId}.ics`)
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyTicket, setBusyTicket] = useState('')
  const [busyOrder, setBusyOrder] = useState('')

  useEffect(() => {
    getMyOrders().then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your tickets.'))
      .finally(() => setLoading(false))
  }, [])

  async function download(ticketId: string, kind: 'pdf' | 'qr') {
    setBusyTicket(ticketId)
    setError('')
    try {
      await downloadTicket(ticketId, kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket download failed.')
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
      setError(err instanceof Error ? err.message : `Could not ${action} the order.`)
    } finally {
      setBusyOrder('')
    }
  }

  if (loading) return <p className="text-slate-500">Loading your tickets…</p>
  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-semibold text-indigo-600">Your plans</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">My tickets & orders</h1>
        <p className="mt-2 text-sm text-slate-500">Manage reservations, download printable tickets, and add events to your calendar.</p>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {orders.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-xl font-bold">No tickets just yet</h2>
          <p className="mt-2 text-sm text-slate-500">When you reserve a spot, the order and tickets will show up here.</p>
          <Link to="/events" className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Explore events</Link>
        </section>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
                <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{formatDateTime(order.createdAt)}</p><h2 className="mt-1 text-xl font-bold">{order.eventTitle}</h2><p className="mt-1 text-sm text-slate-500">Order #{order.id.slice(0, 8)}</p></div>
                <div className="text-right"><span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' : order.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{order.status}</span><p className="mt-2 font-bold">{formatKzt(order.total)}</p></div>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                {order.items.map((item) => (
                  <div key={item.ticketTypeId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
                    <div><p className="font-semibold">{item.ticketTypeName}</p><p className="mt-1 text-sm text-slate-500">{item.quantity} ticket{item.quantity === 1 ? '' : 's'}</p></div>
                    <div className="flex flex-wrap gap-2">
                      {item.tickets.map((ticket) => (
                        <div key={ticket.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2">
                          {ticket.qrCodeDataUri && <img src={ticket.qrCodeDataUri} alt={`QR code for ${ticket.ticketTypeName}`} className="size-14 rounded-lg border border-slate-100 p-1" />}
                          <span className="mr-1 text-xs text-slate-500">{ticket.status}</span>
                          <button disabled={busyTicket === ticket.id} onClick={() => void download(ticket.id, 'pdf')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">{busyTicket === ticket.id ? '…' : 'PDF ticket'}</button>
                          <button disabled={busyTicket === ticket.id} onClick={() => void download(ticket.id, 'qr')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">QR image</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => void downloadCalendar(order).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not export this event.'))} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Add to calendar (.ics)</button>
                  {order.status === 'Pending' && <><button disabled={busyOrder === order.id} onClick={() => void updatePending(order.id, 'pay')} className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">{busyOrder === order.id ? 'Working…' : 'Simulate successful payment'}</button><button disabled={busyOrder === order.id} onClick={() => void updatePending(order.id, 'cancel')} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Cancel reservation</button></>}
                  <Link to={`/support?orderId=${order.id}`} className="ml-auto text-sm font-semibold text-indigo-700 hover:underline">Need help with this order?</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
