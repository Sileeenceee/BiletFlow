import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { EventSummary } from '../api/events'
import { formatEventDate } from '../lib/format'
import { useLocale } from '../lib/i18n'
import { eventArt } from './eventArt'
import { CalendarIcon, PinIcon } from './icons'

export function EventArt({ event, className = '', badge }: { event: EventSummary; className?: string; badge?: ReactNode }) {
  const { gradient, Icon } = eventArt(event.category)
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} ${className}`}>
      {event.imageUrls?.[0] ? (
        <img src={event.imageUrls[0]} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <div aria-hidden="true" className="absolute -right-4 -top-4 size-28 rounded-full bg-white/15" />
          <div aria-hidden="true" className="absolute bottom-5 left-5 size-16 rounded-full bg-amber-300/25" />
          <Icon className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white" />
        </>
      )}
      {badge && <div className="absolute left-3 top-3 flex gap-1.5">{badge}</div>}
    </div>
  )
}

export function Badge({ tone = 'white', children }: { tone?: 'white' | 'green' | 'amber' | 'cyan' | 'rose' | 'slate'; children: ReactNode }) {
  const tones = {
    white: 'bg-white/90 text-slate-800',
    green: 'bg-[#DCFCE7] text-[#166534]',
    amber: 'bg-[#FEF3C7] text-[#92400E]',
    cyan: 'bg-[#CFFAFE] text-[#164E63]',
    rose: 'bg-[#FEE2E2] text-[#B91C1C]',
    slate: 'bg-[#E2E8F0] text-[#334155]',
  }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>
}

/** Event card from the design's Home and Events screens. `footer` replaces the default "View event" row. */
export function EventCard({ event, badge, footer }: { event: EventSummary; badge?: ReactNode; footer?: ReactNode }) {
  const { t } = useLocale()
  const seated = event.seatingMode === 'Assigned'
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-2 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5">
      <EventArt event={event} className="h-[170px]" badge={badge ?? (seated ? <Badge tone="cyan">{t('home.seatMap')}</Badge> : undefined)} />
      <div className="flex flex-1 flex-col px-3 pb-2 pt-4">
        {event.category && <p className="text-[13px] font-bold text-brand-500">{event.category}</p>}
        <h3 className="mt-0.5 font-display text-xl font-bold leading-snug text-slate-900">
          <Link to={`/events/${event.id}`} className="hover:text-brand-700">{event.title}</Link>
        </h3>
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <CalendarIcon className="size-4 shrink-0 text-slate-500" />
          {formatEventDate(event.startDateUtc, event.timezone)}
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
          <PinIcon className="size-4 shrink-0 text-slate-500" />
          <span className="truncate">{[event.venue, event.city].filter(Boolean).join(', ')}</span>
        </p>
        <div className="mt-auto pt-4">
          <div className="border-t border-slate-200 pt-3">
            {footer ?? (
              <div className="flex justify-end">
                <Link to={`/events/${event.id}`} className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('events.view')}</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
