import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { apiBlob } from '../api/client'
import type { Ticket } from '../api/events'
import { Logo } from '../components/auth'
import { Badge, EventArt } from '../components/EventCard'
import { CalendarIcon, DownloadIcon, PinIcon, PrinterIcon, UserIcon } from '../components/icons'
import { formatEventDay, formatTimeRange, orderCode, saveBlob } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'
import { useMyTickets, useTicketQr } from './tickets/useMyTickets'

const statusInfo: Record<string, { label: MessageKey; tone: 'green' | 'cyan' | 'slate' | 'amber' }> = {
  Valid: { label: 'orders.ticketStatus.Valid', tone: 'green' },
  CheckedIn: { label: 'orders.ticketStatus.CheckedIn', tone: 'cyan' },
  Cancelled: { label: 'orders.ticketStatus.Cancelled', tone: 'slate' },
  Refunded: { label: 'orders.ticketStatus.Refunded', tone: 'amber' },
}

/** One ticket with its QR code and a print layout (design 2.10). */
export default function TicketDetail() {
  const { ticketId = '' } = useParams()
  const { t } = useLocale()
  const { orders, events, loading, error, setError } = useMyTickets()
  const [busy, setBusy] = useState(false)
  const found = orders.flatMap((order) => order.items.flatMap((item) => item.tickets)).find((candidate) => candidate.id === ticketId)
  const qr = useTicketQr(ticketId, found?.qrCodeDataUri, found?.status === 'Valid' || found?.status === 'CheckedIn')

  if (loading) return <p className="text-slate-500">{t('orders.loading')}</p>
  const order = orders.find((candidate) => candidate.items.some((item) => item.tickets.some((ticket) => ticket.id === ticketId)))
  const ticket = order?.items.flatMap((item) => item.tickets).find((candidate) => candidate.id === ticketId)
  if (!order || !ticket) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t('ticket.notFound')}</h1>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <Link to="/orders" className="mt-5 inline-block text-sm font-bold text-brand-500">{t('ticket.back')}</Link>
      </div>
    )
  }

  const event = events[order.eventId] ?? null
  const siblings = order.items.flatMap((item) => item.tickets).filter((candidate) => candidate.id !== ticket.id)
  const usable = ticket.status === 'Valid' || ticket.status === 'CheckedIn'
  const status = statusInfo[ticket.status] ?? { label: 'orders.ticketStatus.Cancelled' as MessageKey, tone: 'slate' as const }
  const seat = seatText(ticket, t)
  const when = event ? `${formatEventDay(event.startDateUtc, event.timezone)}, ${formatTimeRange(event.startDateUtc, event.endDateUtc, event.timezone)}` : ''
  const where = event ? [event.venue, event.venueAddress, event.city].filter(Boolean).join(', ') : ''

  async function download(kind: 'pdf' | 'ics') {
    setBusy(true)
    setError('')
    try {
      if (kind === 'pdf') saveBlob(await apiBlob(`/api/tickets/${ticket!.id}/pdf`), `biletflow-ticket-${ticket!.code}.pdf`)
      else saveBlob(await apiBlob(`/api/events/${order!.eventId}/calendar.ics`), `biletflow-${order!.eventId}.ics`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('orders.downloadError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="print:hidden">
        <h1 className="font-display text-[34px] font-bold tracking-tight text-slate-900">{t('ticket.title')}</h1>
        <Link to="/orders" className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('ticket.back')}</Link>
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-12 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 print:hidden">
          {event && <EventArt event={event} className="h-[150px]" />}
          <h2 className="mt-6 font-display text-[26px] font-bold text-slate-900">{order.eventTitle}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={status.tone}>{t(status.label)}</Badge><Badge tone="cyan">{ticket.ticketTypeName}</Badge></div>
          <ul className="mt-5 space-y-3 text-[15px] text-slate-800">
            {when && <li className="flex gap-3"><CalendarIcon className="size-5 shrink-0 text-slate-500" />{when}</li>}
            {where && <li className="flex gap-3"><PinIcon className="size-5 shrink-0 text-slate-500" />{where}</li>}
            <li className="flex gap-3"><UserIcon className="size-5 shrink-0 text-slate-500" />{ticket.attendeeName}{seat ? ` · ${seat}` : ''}</li>
          </ul>

          <div className="mt-6 flex flex-wrap items-start gap-6">
            {qr
              ? <img src={qr} alt={t('confirmed.qrAlt', { code: ticket.code })} className="size-44" />
              : <div className="grid size-44 place-items-center rounded-xl bg-slate-100 p-4 text-center text-sm text-slate-500">{usable ? t('ticket.qrLoading') : t('ticket.noQr')}</div>}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-500">{t('ticket.id')}</p>
              <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{ticket.code}</p>
              <p className="mt-3 text-[13px] leading-5 text-slate-600">{t('ticket.oneId')}</p>
            </div>
          </div>

          {usable && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => void download('pdf')} className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-500 px-6 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50"><DownloadIcon className="size-5" />{t('confirmed.pdf')}</button>
              <button type="button" onClick={() => window.print()} className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 text-[15px] font-bold text-slate-900 hover:bg-slate-50"><PrinterIcon className="size-5" />{t('ticket.print')}</button>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-8 text-sm font-bold">
            <button type="button" disabled={busy} onClick={() => void download('ics')} className="text-brand-500 hover:text-brand-700">{t('event.calendar')}</button>
            <Link to={`/support?orderId=${order.id}&ticketId=${ticket.id}&eventId=${order.eventId}&new=1`} className="text-brand-500 hover:text-brand-700">{t('checkout.contactSupport')}</Link>
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}

          {siblings.length > 0 && (
            <div className="mt-8 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-bold text-slate-900">{t('ticket.otherInOrder')}</h3>
              <ul className="mt-2 space-y-1">
                {siblings.map((other) => (
                  <li key={other.id}><Link to={`/tickets/${other.id}`} className="text-sm text-brand-500 hover:text-brand-700">{other.ticketTypeName}, {other.attendeeName}{seatText(other, t) ? ` · ${seatText(other, t)}` : ''}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {usable && (
          <section aria-label={t('ticket.printPreview')}>
            <h2 className="font-display text-xl font-bold text-slate-900 print:hidden">{t('ticket.printPreview')}</h2>
            <div className="mt-6 max-w-[560px] border border-slate-200 border-t-8 border-t-brand-500 bg-white p-8 print:mt-0 print:border-slate-400">
              <div className="flex items-center justify-between"><Logo /><span className="text-sm font-bold text-slate-600">{t('ticket.entry')}</span></div>
              <p className="mt-8 font-display text-[30px] font-bold leading-tight text-slate-900">{order.eventTitle}</p>
              {when && <p className="mt-2 font-bold text-slate-900">{when}</p>}
              {where && <p className="mt-1 text-sm text-slate-600">{where}</p>}
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-dashed border-slate-300 pt-6">
                <div><dt className="text-xs font-bold text-slate-500">{t('ticket.type')}</dt><dd className="font-bold text-slate-900">{ticket.ticketTypeName}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">{t('ticket.attendee')}</dt><dd className="font-bold text-slate-900">{ticket.attendeeName}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">{t('ticket.seat')}</dt><dd className="font-bold text-slate-900">{seat || t('ticket.general')}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">{t('orders.order')}</dt><dd className="font-mono font-bold text-slate-900">{orderCode(order)}</dd></div>
              </dl>
              {qr && <img src={qr} alt="" className="mx-auto mt-8 size-64" />}
              <p className="mt-3 break-all text-center font-mono text-sm font-bold text-slate-900">{ticket.code}</p>
              <p className="mt-2 text-center text-xs text-slate-600">{t('ticket.printNote')}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function seatText(ticket: Ticket, t: ReturnType<typeof useLocale>['t']) {
  return ticket.rowLabel ? t('orders.seat', { section: ticket.sectionName ?? '', row: ticket.rowLabel, seat: ticket.seatNumber ?? '' }) : ''
}
