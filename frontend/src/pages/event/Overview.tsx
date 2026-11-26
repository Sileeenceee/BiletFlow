import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { reportEvent } from '../../api/platform'
import type { TicketType } from '../../api/events'
import { Badge } from '../../components/EventCard'
import { eventArt } from '../../components/eventArt'
import { CalendarIcon, FlagIcon, PinIcon, UsersIcon } from '../../components/icons'
import { formatEventDate, formatEventDay, formatKzt, formatTimeRange } from '../../lib/format'
import { useLocale, type MessageKey } from '../../lib/i18n'
import { useEventOrders } from '../tickets/useMyTickets'
import { CancelledNotice, RefundPanel } from './Cancelled'
import type { Flow } from './flow'
import { CalendarOptions, card, fieldInput, Notice } from './shared'

// The English value is what the API stores; only the label is translated.
const reportReasons: { value: string; label: MessageKey }[] = [
  { value: 'Misleading information', label: 'event.reason.misleading' },
  { value: 'Suspected fraud', label: 'event.reason.fraud' },
  { value: 'Prohibited content', label: 'event.reason.prohibited' },
  { value: 'Other', label: 'event.reason.other' },
]

export function EventOverview({ flow }: { flow: Flow }) {
  const { event, calendar, tickets } = flow
  const { t } = useLocale()
  const [reportOpen, setReportOpen] = useState(false)
  const [reportMessage, setReportMessage] = useState('')
  const { gradient, Icon } = eventArt(event.category)
  const left = tickets.reduce((sum, ticket) => sum + Math.max(0, ticket.availableQuantity), 0)
  const cancelledOrders = useEventOrders(event.id, !!event.isCancelled && flow.signedIn)

  async function submitReport(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    setReportMessage('')
    try {
      await reportEvent(event.id, String(data.get('reason')), String(data.get('details')).trim())
      setReportOpen(false)
      setReportMessage(t('event.reportSent'))
    } catch (err) {
      setReportMessage(err instanceof Error ? err.message : t('event.reportError'))
    }
  }

  return (
    <>
      <section className={`relative overflow-hidden bg-gradient-to-br ${gradient} text-white`}>
        {event.imageUrls?.[0] && <img src={event.imageUrls[0]} alt="" className="absolute inset-0 size-full object-cover" />}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/15 to-[#0F172A]/70" />
        {!event.imageUrls?.[0] && (
          <>
            <div aria-hidden="true" className="absolute -right-10 top-1 size-60 rounded-full bg-white/10" />
            <div aria-hidden="true" className="absolute bottom-16 left-12 size-44 rounded-full bg-amber-300/20" />
            <Icon className="absolute left-1/2 top-[42%] size-24 -translate-x-1/2 -translate-y-1/2 text-white/70" />
          </>
        )}
        <div className="relative mx-auto flex min-h-[380px] max-w-7xl flex-col px-4 pb-6 pt-6 sm:px-6 lg:px-8">
          <nav aria-label={t('event.breadcrumb')} className="text-[13px] text-white/90">
            <Link to="/events" className="hover:underline">{t('nav.events')}</Link>
            {event.category && <> / <Link to={`/events?category=${encodeURIComponent(event.category)}`} className="hover:underline">{event.category}</Link></>}
            {' / '}<span>{event.title}</span>
          </nav>
          <div className="mt-auto">
            <div className="flex flex-wrap gap-1.5">
              {event.category && <Badge tone="cyan">{event.category}</Badge>}
              {event.visibility && event.visibility !== 'Public' && <Badge>{t(event.visibility === 'Unlisted' ? 'event.unlisted' : 'event.private')}</Badge>}
              {event.seatingMode === 'Assigned' && <Badge tone="amber">{t('home.seatMap')}</Badge>}
              {event.isCancelled && <Badge tone="rose">{t('events.cancelled')}</Badge>}
            </div>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-[50px] sm:leading-[1.1]">{event.title}</h1>
            {event.isCancelled
              ? <p className="mt-1 text-[15px] text-white/90">{t('cancelled.was', { details: [formatEventDay(event.startDateUtc, event.timezone), event.venue, event.city].filter(Boolean).join(', ') })}</p>
              : event.city && <p className="mt-1 text-[15px] text-white/90">{event.city}</p>}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl items-start gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:px-8">
        <div className="min-w-0">
          {event.isCancelled && <CancelledNotice flow={flow} orders={cancelledOrders} />}

          <div className="grid gap-4 sm:grid-cols-3">
            <InfoCard icon={<CalendarIcon className="size-5" />} label={t('event.when')} value={formatEventDay(event.startDateUtc, event.timezone)} detail={`${formatTimeRange(event.startDateUtc, event.endDateUtc, event.timezone)}${event.timezone ? `, ${event.timezone}` : ''}`} />
            <InfoCard icon={<PinIcon className="size-5" />} label={t('event.venue')} value={event.venue} detail={[event.venueAddress, event.city].filter(Boolean).join(', ')} />
            {event.capacity
              ? <InfoCard icon={<UsersIcon className="size-5" />} label={t('event.capacity')} value={t('event.places', { count: event.capacity })} detail={t('event.left', { count: left })} />
              : tickets.length > 0 && <InfoCard icon={<UsersIcon className="size-5" />} label={t('event.availability')} value={t('event.left', { count: left })} />}
          </div>

          {(event.registrationOpensAt || event.registrationClosesAt) && (
            <p className="mt-4 text-sm text-slate-600">
              {event.registrationOpensAt && <>{t('event.opens')}: <strong className="text-slate-800">{formatEventDate(event.registrationOpensAt, event.timezone)}</strong></>}
              {event.registrationOpensAt && event.registrationClosesAt && ' · '}
              {event.registrationClosesAt && <>{t('event.closes')}: <strong className="text-slate-800">{formatEventDate(event.registrationClosesAt, event.timezone)}</strong></>}
            </p>
          )}

          <h2 className="mt-10 font-display text-[26px] font-bold text-slate-900">{t('event.about')}</h2>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-[15px] leading-7 text-slate-600">{event.description}</p>

          {calendar && (
            <>
              <h2 className="mt-10 font-display text-xl font-bold text-slate-900">{t('event.calendar')}</h2>
              <div className="mt-4 flex flex-wrap gap-3"><CalendarOptions links={calendar} onError={flow.setError} /></div>
            </>
          )}

          <h2 className="mt-10 font-display text-xl font-bold text-slate-900">{t('event.venue')}</h2>
          <div className={`${card} mt-4 flex items-start gap-4 p-5`}>
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><PinIcon className="size-6" /></span>
            <div>
              <p className="font-bold text-slate-900">{event.venue}</p>
              <p className="mt-0.5 text-sm text-slate-600">{[event.venueAddress, event.city].filter(Boolean).join(', ')}</p>
            </div>
          </div>

          {event.refundPolicy && (
            <>
              <h2 className="mt-10 font-display text-xl font-bold text-slate-900">{t('event.refundPolicy')}</h2>
              <p className="mt-3 max-w-3xl whitespace-pre-line text-[15px] leading-7 text-slate-600">{event.refundPolicy}</p>
            </>
          )}

          {flow.signedIn && (
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <Link to={`/support?eventId=${event.id}&new=1`} className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('event.help')}</Link>
              <button type="button" onClick={() => setReportOpen((open) => !open)} className="inline-flex items-center gap-2 text-sm font-bold text-[#B91C1C] hover:underline">
                <FlagIcon className="size-4" />{t('event.report')}
              </button>
            </div>
          )}
          {reportMessage && <p role="status" className="mt-3 text-sm text-slate-600">{reportMessage}</p>}
          {reportOpen && (
            <form onSubmit={(form) => void submitReport(form)} className={`${card} mt-4 max-w-xl space-y-4 p-5`}>
              <label className="block text-sm font-bold text-slate-900">{t('event.reportReason')}<select name="reason" className={fieldInput}>{reportReasons.map((reason) => <option key={reason.value} value={reason.value}>{t(reason.label)}</option>)}</select></label>
              <label className="block text-sm font-bold text-slate-900">{t('event.reportDetails')}<textarea name="details" rows={3} maxLength={2000} className={`${fieldInput} h-auto py-2.5`} /></label>
              <button className="h-10 rounded-lg bg-[#B91C1C] px-5 text-sm font-bold text-white hover:bg-rose-800">{t('event.reportSend')}</button>
            </form>
          )}
          {flow.error && <p role="alert" className="mt-4 text-sm text-rose-700">{flow.error}</p>}
        </div>

        {event.isCancelled ? <RefundPanel orders={cancelledOrders} /> : <TicketsPanel flow={flow} />}
      </div>
    </>
  )
}

function InfoCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className={`${card} flex gap-3 p-4`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#EEF3FE] text-brand-500">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="mt-0.5 font-bold text-slate-900">{value}</p>
        {detail && <p className="mt-0.5 text-xs text-slate-600">{detail}</p>}
      </div>
    </div>
  )
}

function TicketsPanel({ flow }: { flow: Flow }) {
  const { event, tickets, quote } = flow
  const { t } = useLocale()
  const [promoDraft, setPromoDraft] = useState(flow.promoCode)
  const promoApplied = quote && !quote.promoError && quote.promoCode
  const canBuy = !event.isCancelled && (!flow.hasPaidTickets || flow.paidSalesReady)

  return (
    <aside className={`${card} p-7 lg:sticky lg:top-24`} aria-label={t('event.tickets')}>
      <h2 className="font-display text-[26px] font-bold text-slate-900">{flow.isAssignedMode ? t('event.seats') : t('event.tickets')}</h2>

      {flow.isAssignedMode ? (
        <div className="mt-5 space-y-3">
          {flow.seatMap ? flow.seatMap.sections.filter((section) => section.ticketTypeName).map((section) => (
            <div key={section.sectionId} className="flex items-center justify-between rounded-xl border border-slate-200 px-5 py-4">
              <div><p className="font-bold text-slate-900">{section.name}</p><p className="text-[13px] text-slate-600">{section.ticketTypeName}</p></div>
              <p className="font-bold text-slate-900">{section.price ? formatKzt(section.price) : <span className="text-[#15803D]">{t('event.free')}</span>}</p>
            </div>
          )) : (
            <p role={flow.seatMapError ? 'alert' : undefined} className={`rounded-xl p-4 text-sm ${flow.seatMapError ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-500'}`}>{flow.seatMapError || t('event.loading')}</p>
          )}
          <button type="button" disabled={!flow.seatMap || event.isCancelled} onClick={() => flow.goTo('seats')} className="mt-3 h-14 w-full rounded-lg bg-accent text-[17px] font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">
            {t('event.chooseYourSeats')}
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t('event.noTickets')}</p>
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} flow={flow} />)}
          </ul>

          <form
            className="mt-6"
            onSubmit={(submit) => { submit.preventDefault(); flow.setPromoCode(promoDraft.trim()) }}
          >
            <label htmlFor="promo" className="text-sm font-bold text-slate-900">{t('event.promo')}</label>
            {promoApplied ? (
              <div className="mt-2"><Notice tone="green" title={t('event.promoApplied', { code: quote.promoCode ?? '' })}>
                <span className="flex items-start justify-between gap-3">
                  <span>{t('event.promoSaves', { amount: formatKzt(quote.discountTotal) })}</span>
                  <button type="button" onClick={() => { flow.setPromoCode(''); setPromoDraft('') }} className="shrink-0 text-sm font-bold text-[#15803D] hover:underline">{t('event.remove')}</button>
                </span>
              </Notice></div>
            ) : (
              <div className="mt-2 flex gap-3">
                <input id="promo" value={promoDraft} onChange={(change) => setPromoDraft(change.target.value)} placeholder={t('event.enterCode')} className={`${fieldInput} mt-0 flex-1`} />
                <button type="submit" className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 hover:bg-slate-50">{t('event.apply')}</button>
              </div>
            )}
            {quote?.promoError && <p role="alert" className="mt-2 text-sm text-rose-700">{quote.promoError}</p>}
          </form>

          <dl className="mt-6 space-y-2.5 border-t border-slate-200 pt-5 text-[15px]">
            <div className="flex justify-between"><dt className="text-slate-600">{t('event.subtotal')}</dt><dd className="font-bold text-slate-900">{formatKzt(quote?.subtotal ?? flow.subtotal)}</dd></div>
            {promoApplied && <div className="flex justify-between"><dt className="text-slate-600">{t('checkout.promoLine', { code: quote.promoCode ?? '' })}</dt><dd className="font-bold text-[#15803D]">−{formatKzt(quote.discountTotal)}</dd></div>}
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
            <span className="font-display text-xl font-bold text-slate-900">{t('event.total')}</span>
            <span className="font-display text-[26px] font-bold text-slate-900">{formatKzt(promoApplied ? quote.total : flow.subtotal)}</span>
          </div>

          {flow.hasPaidTickets && !flow.paidSalesReady && <div className="mt-4"><Notice tone="amber">{t('event.notActivated')}</Notice></div>}
          <button type="button" disabled={!flow.hasSelection || !canBuy || !!quote?.promoError} onClick={() => flow.goTo('details')} className="mt-5 h-14 w-full rounded-lg bg-accent text-[17px] font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">
            {t('event.getTickets')}
          </button>
          {!flow.signedIn && <p className="mt-3 text-center text-xs text-slate-500">{t('event.signInHint')}</p>}
        </>
      )}
    </aside>
  )
}

function TicketRow({ ticket, flow }: { ticket: TicketType; flow: Flow }) {
  const { t } = useLocale()
  const [now] = useState(() => Date.now())
  const quantity = flow.quantities[ticket.id] ?? 0
  const ended = !!ticket.salesEndAt && new Date(ticket.salesEndAt).getTime() < now
  const notYet = !!ticket.salesStartAt && new Date(ticket.salesStartAt).getTime() > now
  const soldOut = ticket.availableQuantity <= 0
  const closed = ended || notYet || soldOut
  const max = Math.min(ticket.maxPerOrder, ticket.availableQuantity)
  const stepButton = 'grid size-8 place-items-center rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <li className={`rounded-xl px-5 py-4 ${closed ? 'border border-slate-200 bg-[#F1F5F9]' : quantity > 0 ? 'border-2 border-brand-500 bg-white' : 'border border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`font-bold ${closed ? 'text-slate-500' : 'text-slate-900'}`}>{ticket.name}</h3>
          <p className="mt-0.5 text-[13px] text-slate-600">
            {ended ? t('event.salesEnded') : notYet ? t('event.salesOpen', { date: formatEventDate(ticket.salesStartAt!, flow.event.timezone) }) : ticket.description || ''}
          </p>
        </div>
        {soldOut ? <span className="text-xs font-bold text-slate-700">{t('event.soldOut')}</span>
          : !closed && ticket.availableQuantity <= 20 && <span className="text-xs font-bold text-[#B45309]">{t('event.left', { count: ticket.availableQuantity })}</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className={`font-bold ${ticket.price === 0 ? 'text-[#15803D]' : closed ? 'text-slate-500' : 'text-slate-900'}`}>{ticket.price === 0 ? t('event.free') : formatKzt(ticket.price)}</p>
        {!closed && (
          <div className="flex items-center gap-3">
            <button type="button" aria-label={t('event.removeOne', { name: ticket.name })} disabled={quantity <= 0} onClick={() => flow.setQuantity(ticket.id, quantity - 1)} className={stepButton}>−</button>
            <output aria-label={t('event.quantityFor', { name: ticket.name })} aria-live="polite" className="w-4 text-center font-bold text-slate-900">{quantity}</output>
            <button type="button" aria-label={t('event.addOne', { name: ticket.name })} disabled={quantity >= max} onClick={() => flow.setQuantity(ticket.id, quantity + 1)} className={stepButton}>+</button>
          </div>
        )}
      </div>
    </li>
  )
}
