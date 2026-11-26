import { Link } from 'react-router'
import type { Order } from '../../api/events'
import { EventArt } from '../../components/EventCard'
import { formatEventDate, formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import type { Flow } from './flow'
import { card, CheckoutSteps, fieldInput, fieldLabel, Notice, OrderSummary, primaryButton, secondaryButton } from './shared'
import { useCountdown } from './useCountdown'

export function CheckoutStep({ flow }: { flow: Flow }) {
  // Free orders confirm immediately, so they get the short single-card form from the design.
  if (!flow.order && !flow.hasPaidTickets) return <FreeCheckout flow={flow} />
  return <PaidCheckout flow={flow} />
}

function AttendeeFields({ flow, locked }: { flow: Flow; locked: boolean }) {
  const { t } = useLocale()
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <label className={fieldLabel}>{t('checkout.fullName')}
        <input value={flow.name} onChange={(change) => flow.setName(change.target.value)} disabled={locked} maxLength={200} autoComplete="name" className={fieldInput} />
      </label>
      <label className={fieldLabel}>{t('checkout.email')}
        <input type="email" value={flow.email} onChange={(change) => flow.setEmail(change.target.value)} disabled={locked} maxLength={320} autoComplete="email" className={fieldInput} />
      </label>
    </div>
  )
}

function FreeCheckout({ flow }: { flow: Flow }) {
  const { event } = flow
  const { t } = useLocale()
  const count = flow.assigned ? flow.seats.length : Object.values(flow.quantities).reduce((sum, value) => sum + value, 0)
  return (
    <div className="mx-auto max-w-[680px]">
      <button type="button" onClick={() => flow.goTo(flow.assigned ? 'seats' : 'select')} className="text-sm font-bold text-brand-500 hover:text-brand-700">← {t('checkout.back')}</button>
      <section className={`${card} mt-3 p-8`}>
        <EventArt event={event} className="h-[150px]" />
        <h1 className="mt-6 font-display text-[26px] font-bold text-slate-900">{event.title}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{[formatEventDate(event.startDateUtc, event.timezone), event.venue, event.city].filter(Boolean).join(', ')}</p>

        <p className="mt-6 text-sm font-bold text-slate-900">{t(count === 1 ? 'checkout.ticket' : 'checkout.tickets')}</p>
        <ul className="mt-2 space-y-2">
          {flow.lines.map((line, index) => (
            <li key={`${line.label}-${index}`} className="flex items-center justify-between rounded-xl bg-[#F1F5F9] px-5 py-3">
              <span className="font-bold text-slate-900">{line.label}</span>
              <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-bold text-[#166534]">{t('event.free')}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6"><AttendeeFields flow={flow} locked={flow.busy} /></div>
        <p className="mt-4 text-[13px] text-slate-600">{t('checkout.freeNote')}</p>
        {flow.error && <p role="alert" className="mt-3 text-sm text-rose-700">{flow.error}</p>}
        <button type="button" disabled={flow.busy || !flow.hasSelection || !flow.name.trim() || !flow.email.trim()} onClick={() => void flow.reserve()} className={`${primaryButton} mt-5 w-full`}>
          {flow.busy ? t('event.reserving') : t(count === 1 ? 'checkout.reserveFreeOne' : 'event.reserveFree')}
        </button>
      </section>
    </div>
  )
}

function PaidCheckout({ flow }: { flow: Flow }) {
  const { event, order } = flow
  const { t } = useLocale()
  const clock = useCountdown(order?.expiresAt)
  // Seated orders keep listing the chosen seats; the order itself only has a line per section.
  const lines = order && !flow.assigned
    ? order.items.map((item) => ({ label: `${item.ticketTypeName} × ${item.quantity}`, amount: item.unitPrice * item.quantity }))
    : flow.lines

  return (
    <div>
      <CheckoutSteps current={2} />
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-6">
          {order && clock && (
            <Notice tone="amber" title={clock.expired ? t('checkout.expired') : t('checkout.reservedFor', { time: clock.label })}>
              {t('checkout.reservedText')}
            </Notice>
          )}

          <section className={`${card} p-7`}>
            <h1 className="font-display text-[26px] font-bold text-slate-900">{t('checkout.attendee')}</h1>
            <div className="mt-5"><AttendeeFields flow={flow} locked={!!order || flow.busy} /></div>
            {!order && (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button type="button" disabled={flow.busy || !flow.hasSelection || !flow.name.trim() || !flow.email.trim()} onClick={() => void flow.reserve()} className={primaryButton}>
                  {flow.busy ? t('event.reserving') : t('checkout.reserveAndPay')}
                </button>
                <button type="button" onClick={() => flow.goTo(flow.assigned ? 'seats' : 'select')} className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('checkout.back')}</button>
              </div>
            )}
            {!order && flow.error && <p role="alert" className="mt-3 text-sm text-rose-700">{flow.error}</p>}
          </section>

          <section className={`${card} p-7 ${order ? '' : 'opacity-60'}`} aria-disabled={!order}>
            <h2 className="font-display text-[26px] font-bold text-slate-900">{t('checkout.payment')}</h2>
            <div className="mt-5"><Notice tone="amber" title={t('checkout.demoTitle')}>{t('checkout.demoText')}</Notice></div>
            {order ? (
              <>
                {flow.error && <p role="alert" className="mt-4 text-sm text-rose-700">{flow.error}</p>}
                <button type="button" disabled={flow.busy || !!clock?.expired} onClick={() => void flow.pay('succeeded')} className={`${primaryButton} mt-6 w-full`}>
                  {flow.busy ? t('event.processing') : t('checkout.pay', { amount: formatKzt(order.total) })}
                </button>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                  <button type="button" disabled={flow.busy || !!clock?.expired} onClick={() => void flow.pay('failed')} className="text-sm font-bold text-slate-600 hover:text-slate-900 disabled:opacity-50">{t('checkout.simulateDecline')}</button>
                  <button type="button" disabled={flow.busy} onClick={() => void flow.cancelReservation()} className="text-sm font-bold text-[#B91C1C] hover:underline disabled:opacity-50">{t('checkout.cancel')}</button>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-600">{t('checkout.paymentAfterReserve')}</p>
            )}
          </section>
        </div>

        <OrderSummary event={event} lines={lines} quote={order ? null : flow.quote} order={order} email={flow.email.trim()} />
      </div>
    </div>
  )
}

export function PaymentFailed({ flow, order }: { flow: Flow; order: Order }) {
  const { t } = useLocale()
  const clock = useCountdown(order.expiresAt)
  return (
    <section className={`${card} mx-auto max-w-[500px] px-12 py-10 text-center`}>
      <span className="mx-auto grid size-[76px] place-items-center rounded-full bg-[#FEE2E2] text-4xl text-[#B91C1C]" aria-hidden="true">⚠</span>
      <h1 className="mt-5 font-display text-[28px] font-bold text-slate-900">{t('checkout.failedTitle')}</h1>
      <p className="mt-4 text-left text-[15px] text-slate-600">{t('checkout.failedText')}</p>
      <p className="mt-3 text-left text-[15px] text-slate-600">{t('checkout.noTicket')}</p>
      {clock && (
        <div className="mt-6 text-left">
          <Notice tone="amber" title={clock.expired ? t('checkout.expired') : t('checkout.heldFor', { time: clock.label })}>{t('checkout.retryBefore')}</Notice>
        </div>
      )}
      {flow.error && <p role="alert" className="mt-4 text-sm text-rose-700">{flow.error}</p>}
      <button type="button" disabled={flow.busy || !!clock?.expired} onClick={() => void flow.pay('succeeded')} className={`${primaryButton} mt-4 w-full`}>
        {flow.busy ? t('event.processing') : t('checkout.tryAgain')}
      </button>
      <button type="button" disabled={flow.busy} onClick={() => void flow.cancelReservation()} className={`${secondaryButton} mt-3 w-full`}>{t('checkout.cancel')}</button>
      <Link to={`/support?orderId=${order.id}&eventId=${order.eventId}&new=1`} className="mt-5 inline-block text-sm font-bold text-brand-500 hover:text-brand-700">{t('checkout.contactSupport')}</Link>
    </section>
  )
}

/** A reservation that expired or was cancelled meanwhile. */
export function OrderClosed({ order }: { order: Order }) {
  const { t } = useLocale()
  return (
    <section className={`${card} mx-auto max-w-[500px] px-12 py-10 text-center`}>
      <h1 className="font-display text-[28px] font-bold text-slate-900">{t('checkout.closedTitle')}</h1>
      <p className="mt-3 text-[15px] text-slate-600">{t('checkout.closedText', { status: order.status })}</p>
      <Link to="/orders" className={`${primaryButton} mt-6 w-full`}>{t('event.goToTickets')}</Link>
    </section>
  )
}
