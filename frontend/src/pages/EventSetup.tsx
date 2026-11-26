import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { getEvent, getTicketTypes, updateEvent, type EventSummary, type TicketType } from '../api/events'
import { EventArt } from '../components/EventCard'
import { AlertIcon, CalendarIcon, CheckIcon, EyeIcon, PinIcon, TicketIcon } from '../components/icons'
import { StepProgress } from '../components/StepProgress'
import { formatEventDay, formatKzt, formatNumber, formatTimeRange } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'
import { toEventInput } from './setup/eventInput'
import { SeatingEditor } from './setup/SeatingEditor'
import { TicketTypesEditor } from './setup/TicketTypesEditor'

/** Steps 2 and 3 of creating an event (designs 4.3 and 4.4): tickets and seating, then review and publish. */
export default function EventSetup() {
  const { eventId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useLocale()
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [types, setTypes] = useState<TicketType[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const step = params.get('step') === 'review' ? 'review' : 'tickets'

  useEffect(() => {
    let active = true
    Promise.all([getEvent(eventId), getTicketTypes(eventId)])
      .then(([eventInfo, ticketTypes]) => { if (active) { setEvent(eventInfo); setTypes(ticketTypes) } })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('event.loadError')) })
    return () => { active = false }
  }, [eventId, t])

  function goTo(next: 'tickets' | 'review') {
    setParams(next === 'tickets' ? {} : { step: next })
    window.scrollTo({ top: 0 })
  }

  async function publish() {
    if (!event) return
    setError('')
    setBusy(true)
    try {
      await updateEvent(event.id, toEventInput(event, { isPublished: true }))
      void navigate(`/events/${event.id}/manage`, { state: { published: true } })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manageEvent.saveError'))
      setBusy(false)
    }
  }

  if (!event || !types) {
    return error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p> : <p className="text-slate-500">{t('event.loading')}</p>
  }

  const steps = [t('createEvent.step.details'), t('createEvent.step.tickets'), t('createEvent.step.review')]
  const footer = 'mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5'
  const secondary = 'inline-flex h-12 items-center rounded-lg border border-slate-300 bg-white px-8 text-[15px] font-bold text-slate-900 hover:bg-slate-50'

  if (step === 'tickets') {
    return (
      <div className="mx-auto max-w-[1100px]">
        <StepProgress label={t('createEvent.progress')} current={2} steps={steps} />
        <h1 className="mt-6 font-display text-[30px] font-bold text-slate-900">{t('setup.ticketTypes')}</h1>
        <p className="mt-1 text-[15px] text-slate-600">{t('setup.ticketTypesText', { title: event.title })}</p>
        <div className="mt-5"><TicketTypesEditor event={event} types={types} onChange={setTypes} /></div>
        <div className="mt-8"><SeatingEditor eventId={event.id} types={types} /></div>
        <div className={footer}>
          <Link to={`/events/${event.id}/manage`} className={secondary}>{t('setup.editDetails')}</Link>
          <div className="flex flex-wrap gap-3">
            <Link to={`/events/${event.id}/manage`} className={secondary}>{t('createEvent.saveDraft')}</Link>
            <button type="button" onClick={() => goTo('review')} className="h-12 rounded-lg bg-brand-500 px-10 text-[15px] font-bold text-white hover:bg-brand-600">{t('setup.reviewPublish')}</button>
          </div>
        </div>
      </div>
    )
  }

  const free = types.filter((type) => type.price === 0)
  const paid = types.filter((type) => type.price > 0)
  const places = types.reduce((sum, type) => sum + type.quantity, 0)
  const paidReady = event.paidSalesStatus === 'Active'
  const checks: [MessageKey, 'done' | 'todo' | 'warn'][] = [
    ['setup.check.details', 'done'],
    ['setup.check.tickets', types.length > 0 ? 'done' : 'todo'],
    ...(paid.length > 0 ? [['setup.check.paid', paidReady ? 'done' : 'warn'] as [MessageKey, 'warn' | 'done']] : []),
  ]
  const visibility = event.visibility ?? 'Public'

  return (
    <div className="mx-auto max-w-[1100px]">
      <StepProgress label={t('createEvent.progress')} current={3} steps={steps} />
      <h1 className="mt-6 font-display text-[30px] font-bold text-slate-900">{t('setup.reviewTitle')}</h1>
      <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <EventArt event={event} className="h-[200px]" />
          <div className="px-2 pb-2 pt-6">
            <h2 className="font-display text-[23px] font-bold text-slate-900">{event.title}</h2>
            <ul className="mt-4 space-y-3 text-[15px] text-slate-800">
              <Row icon={<CalendarIcon className="size-5" />}>{formatEventDay(event.startDateUtc, event.timezone)}, {formatTimeRange(event.startDateUtc, event.endDateUtc, event.timezone)}</Row>
              <Row icon={<PinIcon className="size-5" />}>{[event.venue, event.city].filter(Boolean).join(', ')}</Row>
              <Row icon={<TicketIcon className="size-5" />}>{t('setup.typesSummary', { count: types.length, places: formatNumber(event.capacity ?? places) })}</Row>
              <Row icon={<EyeIcon className="size-5" />}>{t(`createEvent.visibility.${visibility}`)}</Row>
            </ul>
            {types.length > 0 && <p className="mt-5 text-sm text-slate-600">{types.map((type) => `${type.name}: ${type.price ? formatKzt(type.price) : t('event.free').toLowerCase()}`).join('. ')}.</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/events/${event.id}/manage`} className={secondary}>{t('setup.editDetails')}</Link>
              <button type="button" onClick={() => goTo('tickets')} className={secondary}>{t('setup.editTickets')}</button>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-7">
          <h2 className="font-display text-[23px] font-bold text-slate-900">{t('setup.ready')}</h2>
          <ul className="mt-4 space-y-3">
            {checks.map(([label, state]) => (
              <li key={label} className="flex items-center gap-3 text-[15px] text-slate-800">
                {state === 'done' && <span className="grid size-6 place-items-center rounded-full bg-[#DCFCE7] text-[#15803D]"><CheckIcon className="size-4" /></span>}
                {state === 'warn' && <span className="grid size-6 place-items-center rounded-full border-2 border-[#FBBF24] bg-[#FEF3C7] text-xs font-bold text-[#B45309]">!</span>}
                {state === 'todo' && <span className="size-6 rounded-full border-2 border-slate-300" />}
                {t(label)}
              </li>
            ))}
            {free.length > 0 && <li className="pl-9 text-[13px] text-slate-500">{t('setup.freeReady', { count: free.length })}</li>}
          </ul>
          {paid.length > 0 && !paidReady && (
            <div className="mt-5 flex gap-3 rounded-xl border border-[#FBBF24]/60 bg-[#FEF3C7] px-4 py-3">
              <AlertIcon className="mt-0.5 size-5 shrink-0 text-[#B45309]" />
              <div><p className="font-bold text-slate-900">{t('setup.paidBlockedTitle')}</p><p className="text-sm text-slate-700">{t('setup.paidBlockedText')}</p></div>
            </div>
          )}
          {types.length === 0 && <p className="mt-5 rounded-xl bg-[#FEF3C7] px-4 py-3 text-sm text-[#92400E]">{t('setup.noTypesWarning')}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
          {event.isPublished
            ? <p className="mt-5 rounded-xl bg-[#DCFCE7] px-4 py-3 text-sm font-bold text-[#166534]">{t('setup.alreadyPublished')}</p>
            : <button type="button" disabled={busy} onClick={() => void publish()} className="mt-5 h-12 w-full rounded-lg bg-brand-500 text-[17px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('common.saving') : t('setup.publish')}</button>}
          <Link to={`/events/${event.id}/manage`} className="mt-3 flex h-12 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-[15px] font-bold text-slate-900 hover:bg-slate-50">{t(event.isPublished ? 'setup.goToManage' : 'setup.saveAsDraft')}</Link>
          {paid.length > 0 && !paidReady && <Link to={`/events/${event.id}/manage`} className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-slate-900 hover:bg-amber-300">{t('setup.activatePaid')}</Link>}
        </aside>
      </div>
    </div>
  )
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <li className="flex items-center gap-3"><span className="shrink-0 text-slate-500">{icon}</span><span>{children}</span></li>
}
