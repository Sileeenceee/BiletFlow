import type { ReactNode } from 'react'
import { apiBlob } from '../../api/client'
import type { EventSummary, Order } from '../../api/events'
import type { CalendarLinks, Quote } from '../../api/platform'
import { EventArt } from '../../components/EventCard'
import { formatEventDate, formatKzt, saveBlob } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

export const card = 'rounded-2xl border border-slate-200 bg-white'
export const primaryButton = 'inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50'
export const secondaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
export const fieldInput = 'mt-2 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-slate-50 disabled:text-slate-500'
export const fieldLabel = 'block text-[13px] font-bold text-slate-900'

export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  const { t } = useLocale()
  const steps = [t('checkout.step.select'), t('checkout.step.details'), t('checkout.step.confirmation')]
  return (
    <ol className="mx-auto grid max-w-3xl grid-cols-3" aria-label={t('checkout.progress')}>
      {steps.map((label, index) => {
        const number = index + 1
        const done = number < current
        const active = number === current
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="relative flex flex-col items-center text-center">
            {index > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-[15px] h-0.5 w-full ${number <= current ? 'bg-brand-500' : 'bg-slate-300'}`} />}
            <span className={`relative grid size-8 place-items-center rounded-full text-sm font-bold ${done ? 'bg-brand-500 text-white' : active ? 'bg-[#164E63] text-white' : 'border-2 border-slate-300 bg-white text-slate-500'}`}>
              {done ? '✓' : number}
            </span>
            <span className={`mt-2 text-sm ${done || active ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function Notice({ tone, title, children }: { tone: 'amber' | 'rose' | 'cyan' | 'green'; title?: ReactNode; children?: ReactNode }) {
  const tones = {
    amber: 'border-[#FBBF24]/60 bg-[#FEF3C7] text-[#92400E]',
    rose: 'border-rose-200 bg-[#FEE2E2] text-[#B91C1C]',
    cyan: 'border-transparent bg-[#ECFEFF] text-[#164E63]',
    green: 'border-[#86EFAC] bg-[#DCFCE7] text-[#166534]',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="font-bold text-slate-900">{title}</p>}
      {children && <div className={title ? 'mt-0.5 text-slate-700' : ''}>{children}</div>}
    </div>
  )
}

export type SummaryLine = { label: string; amount: number }

/** Right-hand order summary on the checkout step. */
export function OrderSummary({ event, lines, quote, order, email }: { event: EventSummary; lines: SummaryLine[]; quote: Quote | null; order: Order | null; email: string }) {
  const { t } = useLocale()
  const subtotal = order ? order.total + order.discountTotal : quote?.subtotal ?? lines.reduce((sum, line) => sum + line.amount, 0)
  const discount = order ? order.discountTotal : quote && !quote.promoError ? quote.discountTotal : 0
  const promo = order ? order.promoCode : quote && !quote.promoError ? quote.promoCode : null
  const total = order ? order.total : subtotal - discount
  const money = (value: number) => value === 0 ? <span className="font-bold text-[#15803D]">{t('event.free')}</span> : <span className="font-bold text-slate-900">{formatKzt(value)}</span>
  return (
    <aside className={`${card} h-fit p-7`} aria-label={t('checkout.summary')}>
      <h2 className="font-display text-2xl font-bold text-slate-900">{t('checkout.summary')}</h2>
      <div className="mt-5 flex gap-4 border-b border-slate-200 pb-5">
        <EventArt event={event} className="size-[88px] shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-snug text-slate-900">{event.title}</p>
          <p className="mt-1 text-sm text-slate-600">{formatEventDate(event.startDateUtc, event.timezone)}</p>
          <p className="text-sm text-slate-600">{[event.venue, event.city].filter(Boolean).join(', ')}</p>
        </div>
      </div>
      <ul className="space-y-3 border-b border-slate-200 py-5 text-[15px]">
        {lines.map((line, index) => <li key={`${line.label}-${index}`} className="flex justify-between gap-4"><span className="text-slate-700">{line.label}</span>{money(line.amount)}</li>)}
      </ul>
      <dl className="space-y-3 border-b border-slate-200 py-5 text-[15px]">
        <div className="flex justify-between"><dt className="text-slate-600">{t('event.subtotal')}</dt><dd>{money(subtotal)}</dd></div>
        {discount > 0 && <div className="flex justify-between"><dt className="text-slate-600">{t('checkout.promoLine', { code: promo ?? '' })}</dt><dd className="font-bold text-[#15803D]">−{formatKzt(discount)}</dd></div>}      </dl>
      <div className="flex items-baseline justify-between pt-5">
        <span className="font-display text-xl font-bold text-slate-900">{t('event.total')}</span>
        <span className="font-display text-[26px] font-bold text-slate-900">{formatKzt(total)}</span>
      </div>
      {total > 0 && <p className="mt-3 text-[13px] text-slate-500">{t('checkout.issuedAfterPayment')}</p>}
      {email && <div className="mt-5"><Notice tone="cyan">{t('checkout.emailNote', { email })}</Notice></div>}
    </aside>
  )
}

/** One-click calendar options; none of them needs write access to the attendee's calendar (SRS 4.11). */
export function CalendarOptions({ links, onError }: { links: CalendarLinks; onError: (message: string) => void }) {
  const { t } = useLocale()
  const linkClass = 'inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-50'
  return (
    <>
      {!links.isCancelled && <a href={links.googleCalendarUrl} target="_blank" rel="noreferrer" className={linkClass}>Google Calendar</a>}
      {!links.isCancelled && <a href={links.outlookCalendarUrl} target="_blank" rel="noreferrer" className={linkClass}>Outlook</a>}
      <button
        type="button"
        onClick={() => void apiBlob(links.icsUrl)
          .then((blob) => saveBlob(blob, `biletflow-${links.eventId}.ics`))
          .catch((err: unknown) => onError(err instanceof Error ? err.message : t('event.loadError')))}
        className={linkClass}
      >
        {t('event.ics')}
      </button>
    </>
  )
}
