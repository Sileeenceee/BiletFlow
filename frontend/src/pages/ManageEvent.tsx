import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { duplicateEvent, getCities, getEvent, getTicketTypes, updateEvent, type City, type EventSummary, type TicketType } from '../api/events'
import { Badge } from '../components/EventCard'
import { inputClass } from '../components/form'
import { EyeIcon } from '../components/icons'
import { useLocale } from '../lib/i18n'
import { AnalyticsTab } from './manage/AnalyticsTab'
import { AttendeesTab } from './manage/AttendeesTab'
import { HistoryTab } from './manage/HistoryTab'
import { OrdersTab } from './manage/OrdersTab'
import { OverviewTab } from './manage/OverviewTab'
import { PaidSalesPanel } from './manage/PaidSalesPanel'
import { PromotionsTab } from './manage/PromotionsTab'
import { SupportTab } from './manage/SupportTab'
import { MANAGE_TABS, parseTab, TAB_LABELS, type ManageTab } from './manage/tabs'
import { TeamTab } from './manage/TeamTab'
import { card, secondaryButton } from './manage/ui'
import { localDateTime } from './setup/eventInput'
import { SeatingEditor } from './setup/SeatingEditor'
import { TicketTypesEditor } from './setup/TicketTypesEditor'

/** Managing one event (designs 4.5 to 4.15): a header with actions and one tab per area. */
export default function ManageEvent() {
  const { eventId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useLocale()
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(() => (location.state as { published?: boolean } | null)?.published ? t('manage.publishedMessage') : '')
  const [busy, setBusy] = useState(false)
  const tab = parseTab(searchParams.get('tab'))
  const openOrderId = searchParams.get('order')

  useEffect(() => {
    let active = true
    getEvent(eventId)
      .then((value) => { if (active) setEvent(value) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('event.loadError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [eventId, t])

  function switchTab(next: ManageTab, extra: Record<string, string> = {}) {
    setSearchParams(next === 'overview' ? extra : { tab: next, ...extra }, { replace: true })
    setError('')
    setMessage('')
  }

  async function duplicate() {
    if (!event) return
    setError('')
    setBusy(true)
    try {
      const copy = await duplicateEvent(event.id)
      void navigate(`/events/${copy.id}/manage`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('events.duplicateError'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-slate-500">{t('manageEvent.loading')}</p>
  if (error && !event) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p>
  if (!event) return null

  const status = event.isCancelled ? { label: t('events.cancelled'), tone: 'rose' as const }
    : event.isSuspended ? { label: t('admin.events.suspended'), tone: 'rose' as const }
    : event.isPublished ? { label: t('events.published'), tone: 'green' as const }
    : { label: t('events.draft'), tone: 'slate' as const }

  return (
    <div className="mx-auto max-w-[1100px]">
      <nav aria-label={t('event.breadcrumb')} className="text-sm text-slate-600">
        <Link to="/events" className="hover:text-slate-900">{t('shell.myEvents')}</Link> / <span>{event.title}</span>
      </nav>
      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-[34px]">{event.title}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone="slate">{t(`manage.visibility.${event.visibility ?? 'Public'}`)}</Badge>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to={`/events/${event.id}`} className={secondaryButton}><EyeIcon className="size-5" />{t('manageEvent.preview')}</Link>
          {!event.isCancelled && <button type="button" onClick={() => switchTab('edit')} className={secondaryButton}>{t('common.edit')}</button>}
          <button type="button" disabled={busy} onClick={() => void duplicate()} className={secondaryButton}>{t('manage.duplicate')}</button>
        </div>
      </header>
      {event.isSuspended && <p role="alert" className="mt-3 rounded-xl bg-[#FEE2E2] p-3 text-sm text-[#B91C1C]">{t('manageEvent.suspended')}</p>}

      <div role="tablist" aria-label={t('manage.sections')} className="mt-5 flex gap-7 overflow-x-auto border-b border-slate-200 [scrollbar-width:none]">
        {MANAGE_TABS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => switchTab(item)} className={`-mb-px shrink-0 border-b-2 pb-3 text-[15px] transition ${tab === item ? 'border-brand-500 font-bold text-brand-500' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {t(TAB_LABELS[item])}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {message && <p role="status" className="mb-5 rounded-xl bg-[#DCFCE7] p-3 text-sm font-bold text-[#166534]">{message}</p>}
        {error && <p role="alert" className="mb-5 rounded-xl bg-[#FEE2E2] p-3 text-sm text-[#B91C1C]">{error}</p>}
        {tab === 'overview' && <OverviewTab event={event} onUpdate={setEvent} onOpenTab={(next) => switchTab(next)} onError={setError} onMessage={setMessage} />}
        {tab === 'edit' && <EditDetails event={event} onUpdate={setEvent} onDone={() => switchTab('overview')} onError={setError} onMessage={setMessage} />}
        {tab === 'tickets' && <TicketsAndSeating event={event} onError={setError} />}
        {tab === 'attendees' && <AttendeesTab eventId={eventId} onError={setError} onOpenOrder={(orderId) => switchTab('orders', { order: orderId })} />}
        {tab === 'orders' && <OrdersTab eventId={eventId} openOrderId={openOrderId} onOpenOrder={(orderId) => switchTab('orders', { order: orderId })} onCloseOrder={() => switchTab('orders')} onError={setError} onMessage={setMessage} />}
        {tab === 'promotions' && <PromotionsTab eventId={eventId} onError={setError} onMessage={setMessage} />}
        {tab === 'analytics' && <AnalyticsTab eventId={eventId} onError={setError} />}
        {tab === 'paid' && <PaidSalesPanel event={event} onStatus={(paidSalesStatus) => setEvent({ ...event, paidSalesStatus })} onError={setError} onMessage={setMessage} />}
        {tab === 'history' && <HistoryTab eventId={eventId} onError={setError} />}
        {tab === 'team' && <TeamTab eventId={eventId} onError={setError} onMessage={setMessage} />}
        {tab === 'support' && <SupportTab eventId={eventId} onError={setError} />}
      </div>
    </div>
  )
}

function TicketsAndSeating({ event, onError }: { event: EventSummary; onError: (value: string) => void }) {
  const { t } = useLocale()
  const [types, setTypes] = useState<TicketType[] | null>(null)
  useEffect(() => {
    let active = true
    getTicketTypes(event.id).then((rows) => { if (active) setTypes(rows) }).catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.ticketsLoadError')) })
    return () => { active = false }
  }, [event.id, onError, t])
  if (!types) return <p className="text-slate-500">{t('manageEvent.loading')}</p>
  return (
    <div className="space-y-8">
      <TicketTypesEditor event={event} types={types} onChange={setTypes} />
      <SeatingEditor eventId={event.id} types={types} />
    </div>
  )
}

function EditDetails({ event, onUpdate, onDone, onError, onMessage }: {
  event: EventSummary
  onUpdate: (event: EventSummary) => void
  onDone: () => void
  onError: (value: string) => void
  onMessage: (value: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [cities, setCities] = useState<City[] | null>(null)
  const [citiesError, setCitiesError] = useState('')
  const { t } = useLocale()

  useEffect(() => {
    let active = true
    getCities()
      .then((data) => { if (active) setCities(data) })
      .catch((err: unknown) => { if (active) setCitiesError(err instanceof Error ? err.message : t('createEvent.loadCitiesError')) })
    return () => { active = false }
  }, [t])

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    onError('')
    onMessage('')
    const data = new FormData(form.currentTarget)
    setBusy(true)
    try {
      const saved = await updateEvent(event.id, {
        title: String(data.get('title')),
        description: String(data.get('description')),
        venue: String(data.get('venue')),
        cityId: Number(data.get('cityId')),
        category: String(data.get('category')) || null,
        startDateUtc: new Date(String(data.get('start'))).toISOString(),
        endDateUtc: new Date(String(data.get('end'))).toISOString(),
        isPublished: event.isPublished,
        visibility: String(data.get('visibility')) as EventSummary['visibility'],
        capacity: data.get('capacity') ? Number(data.get('capacity')) : null,
        registrationOpensAt: data.get('opens') ? new Date(String(data.get('opens'))).toISOString() : null,
        registrationClosesAt: data.get('closes') ? new Date(String(data.get('closes'))).toISOString() : null,
        imageUrls: String(data.get('imageUrls')).split('\n').map((url) => url.trim()).filter(Boolean),
        venueAddress: String(data.get('venueAddress')).trim() || null,
        timezone: String(data.get('timezone')).trim() || null,
        refundPolicy: String(data.get('refundPolicy')).trim() || null,
      })
      onUpdate(saved)
      onMessage(t('manageEvent.saved'))
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const label = 'block text-[13px] font-bold text-slate-900'
  const field = `${inputClass} mt-2`
  return (
    <form onSubmit={(form) => void submit(form)} className={`${card} max-w-3xl space-y-5 p-7`}>
      <div><h2 className="font-display text-[23px] font-bold text-slate-900">{t('manageEvent.detailsTitle')}</h2><p className="mt-1 text-sm text-slate-600">{t('manageEvent.detailsText')}</p></div>
      <label className={label}>{t('createEvent.titleLabel')}<input name="title" required minLength={3} defaultValue={event.title} className={field} /></label>
      <label className={label}>{t('createEvent.description')}<textarea name="description" required minLength={20} rows={4} defaultValue={event.description} className={field} /></label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>{t('createEvent.venueName')}<input name="venue" required defaultValue={event.venue} className={field} /></label>
        {/* The select mounts only after cities load, so defaultValue can preselect the event's city. */}
        {citiesError ? <p role="alert" className="text-sm text-rose-600">{t('createEvent.citiesError', { error: citiesError })}</p>
          : cities ? <label className={label}>{t('createEvent.city')}<select name="cityId" required defaultValue={String(event.cityId)} className={field}><option value="">{t('createEvent.chooseCity')}</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          : <p className="text-sm text-slate-500">{t('createEvent.loadingCities')}</p>}
        <label className={label}>{t('manageEvent.venueAddress')}<input name="venueAddress" maxLength={300} defaultValue={event.venueAddress ?? ''} className={field} /></label>
        <label className={label}>{t('manageEvent.timezone')}<input name="timezone" placeholder="Asia/Almaty" defaultValue={event.timezone ?? 'Asia/Almaty'} className={field} /></label>
        <label className={label}>{t('createEvent.category')}<input name="category" defaultValue={event.category ?? ''} className={field} /></label>
        <label className={label}>{t('createEvent.visibility')}<select name="visibility" defaultValue={event.visibility ?? 'Public'} className={field}><option value="Public">{t('createEvent.visibility.Public')}</option><option value="Unlisted">{t('createEvent.visibility.Unlisted')}</option><option value="Private">{t('createEvent.visibility.Private')}</option></select></label>
        <label className={label}>{t('createEvent.starts')}<input name="start" required type="datetime-local" defaultValue={localDateTime(event.startDateUtc)} className={field} /></label>
        <label className={label}>{t('createEvent.ends')}<input name="end" required type="datetime-local" defaultValue={localDateTime(event.endDateUtc)} className={field} /></label>
        <label className={label}>{t('manageEvent.capacity')}<input name="capacity" type="number" min={1} defaultValue={event.capacity ?? ''} className={field} /></label>
        <span />
        <label className={label}>{t('event.opens')}<input name="opens" type="datetime-local" defaultValue={localDateTime(event.registrationOpensAt)} className={field} /></label>
        <label className={label}>{t('event.closes')}<input name="closes" type="datetime-local" defaultValue={localDateTime(event.registrationClosesAt)} className={field} /></label>
      </div>
      <label className={label}>{t('manageEvent.refundPolicy')}<textarea name="refundPolicy" rows={3} maxLength={2000} defaultValue={event.refundPolicy ?? ''} className={field} /></label>
      <label className={label}>{t('createEvent.coverImage')}<textarea name="imageUrls" rows={2} defaultValue={(event.imageUrls ?? []).join('\n')} className={field} /></label>
      <div className="flex gap-3">
        <button disabled={busy || !cities} className="h-12 rounded-lg bg-brand-500 px-8 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('common.saving') : t('manageEvent.save')}</button>
        <button type="button" onClick={onDone} className={`${secondaryButton} h-12 px-8`}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}
