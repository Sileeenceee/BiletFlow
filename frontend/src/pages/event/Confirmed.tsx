import { useState } from 'react'
import { Link } from 'react-router'
import { apiBlob } from '../../api/client'
import type { Order, Ticket } from '../../api/events'
import { Badge } from '../../components/EventCard'
import { CalendarIcon, ChevronRightIcon, PinIcon, UserIcon } from '../../components/icons'
import { formatEventDay, formatKzt, formatTimeRange, saveBlob } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import type { Flow } from './flow'
import { CalendarOptions, card, CheckoutSteps, primaryButton, secondaryButton } from './shared'

const STATUSES = ['Valid', 'CheckedIn', 'Cancelled', 'Refunded'] as const
type TicketStatus = (typeof STATUSES)[number]
const isStatus = (status: string): status is TicketStatus => (STATUSES as readonly string[]).includes(status)
const statusTone = (status: string): 'green' | 'cyan' | 'rose' => status === 'Valid' ? 'green' : status === 'CheckedIn' ? 'cyan' : 'rose'

export function OrderConfirmed({ flow, order }: { flow: Flow; order: Order }) {
  const { event, calendar } = flow
  const { t } = useLocale()
  const [downloading, setDownloading] = useState(false)
  const tickets = order.items.flatMap((item) => item.tickets)
  const [first, ...others] = tickets
  const statusLabel = (status: string) => isStatus(status) ? t(`confirmed.status.${status}`) : status
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const seatOf = (ticket: Ticket) => ticket.rowLabel ? t('seatMap.seat', { section: ticket.sectionName ?? '', row: ticket.rowLabel, seat: ticket.seatNumber ?? '' }) : null

  async function downloadPdf(ticket: Ticket) {
    setDownloading(true)
    try {
      saveBlob(await apiBlob(`/api/tickets/${ticket.id}/pdf`), `biletflow-ticket-${ticket.code}.pdf`)
    } catch (err) {
      flow.setError(err instanceof Error ? err.message : t('event.loadError'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mx-auto max-w-[800px]">
      <CheckoutSteps current={3} />
      <div className="mt-10 text-center">
        <span aria-hidden="true" className="mx-auto grid size-[72px] place-items-center rounded-full bg-[#DCFCE7] text-4xl font-bold text-[#15803D]">✓</span>
        <h1 className="mt-6 font-display text-[38px] font-bold tracking-tight text-slate-900">{t('confirmed.title')}</h1>
        <p className="mt-1 text-[15px] text-slate-600">{t('confirmed.text', { order: order.id.slice(0, 8).toUpperCase(), email: flow.email.trim() || '—' })}</p>
      </div>

      {first && (
        <article className={`${card} relative mt-8 grid overflow-hidden sm:grid-cols-[1fr_240px]`}>
          <div className="p-8 sm:p-10">
            <h2 className="font-display text-[26px] font-bold text-slate-900">{event.title}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={statusTone(first.status)}>{statusLabel(first.status)}</Badge>
              <Badge tone="cyan">{first.ticketTypeName}</Badge>
            </div>
            <ul className="mt-6 space-y-3 text-[15px] text-slate-800">
              <li className="flex gap-3"><CalendarIcon className="size-5 shrink-0 text-slate-500" />{formatEventDay(event.startDateUtc, event.timezone)}, {formatTimeRange(event.startDateUtc, event.endDateUtc, event.timezone)}</li>
              <li className="flex gap-3"><PinIcon className="size-5 shrink-0 text-slate-500" />{[event.venue, event.venueAddress, event.city].filter(Boolean).join(', ')}</li>
              <li className="flex gap-3"><UserIcon className="size-5 shrink-0 text-slate-500" />{first.attendeeName}{seatOf(first) ? ` · ${seatOf(first)}` : ''}</li>
            </ul>
            <p className="mt-6 break-all text-sm font-bold text-slate-700">{t('confirmed.ticketId', { code: first.code })}</p>
          </div>
          <div className="flex flex-col items-center justify-center border-t border-dashed border-slate-300 p-6 sm:border-l sm:border-t-0">
            {first.qrCodeDataUri
              ? <img src={first.qrCodeDataUri} alt={t('confirmed.qrAlt', { code: first.code })} className="size-44" />
              : <Link to="/orders" className="text-sm font-bold text-brand-500">{t('event.goToTickets')}</Link>}
            <p className="mt-3 text-xs text-slate-500">{t('confirmed.scan')}</p>
            <p className="max-w-full break-all text-center font-mono text-[11px] font-bold text-slate-900">{first.code}</p>
          </div>
        </article>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {first
          ? <button type="button" disabled={downloading} onClick={() => void downloadPdf(first)} className={primaryButton}>{downloading ? '…' : t('confirmed.pdf')}</button>
          : <Link to="/orders" className={primaryButton}>{t('event.goToTickets')}</Link>}
        {calendar && <><span className="ml-2 text-sm font-bold text-slate-600">{t('event.calendar')}</span><CalendarOptions links={calendar} onError={flow.setError} /></>}
      </div>
      {flow.error && <p role="alert" className="mt-3 text-sm text-rose-700">{flow.error}</p>}

      <section className={`${card} mt-8 flex items-start justify-between gap-6 p-7`}>
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">{t('checkout.summary')}</h2>
          <p className="mt-3 text-sm text-slate-600">{t('confirmed.ticketCount', { count, names: order.items.map((item) => item.ticketTypeName).join(', ') })}</p>
          {order.promoCode && <p className="mt-1 text-sm text-[#15803D]">{t('checkout.promoLine', { code: order.promoCode })} −{formatKzt(order.discountTotal)}</p>}
          {order.isSimulated && order.total > 0 && <p className="mt-1 text-sm text-slate-600">{t('confirmed.simulated')}</p>}
        </div>
        <p className="font-display text-[26px] font-bold text-slate-900">{order.total === 0 ? t('event.free') : formatKzt(order.total)}</p>
      </section>

      <section className={`${card} mt-5 flex flex-wrap items-center justify-between gap-4 p-6`}>
        <div>
          <h2 className="font-bold text-slate-900">{t('confirmed.wrongTitle')}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{t('confirmed.wrongText')}</p>
        </div>
        <Link to={`/support?orderId=${order.id}&eventId=${order.eventId}&new=1`} className={secondaryButton}>{t('confirmed.getSupport')}</Link>
      </section>

      {others.length > 0 && (
        <>
          <h2 className="mt-10 font-display text-xl font-bold text-slate-900">{t(others.length === 1 ? 'confirmed.otherOne' : 'confirmed.others')}</h2>
          <ul className="mt-4 space-y-3">
            {others.map((ticket) => (
              <li key={ticket.id}>
                <Link to="/orders" className={`${card} flex items-center justify-between gap-4 px-7 py-5 transition hover:border-slate-300`}>
                  <span>
                    <span className="block font-bold text-slate-900">{ticket.ticketTypeName}, {ticket.attendeeName}{seatOf(ticket) ? ` · ${seatOf(ticket)}` : ''}</span>
                    <span className="block break-all font-mono text-[12px] text-slate-500">{ticket.code}</span>
                  </span>
                  <span className="flex items-center gap-4"><Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge><ChevronRightIcon className="size-5 text-slate-500" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
