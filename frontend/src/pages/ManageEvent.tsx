import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  cancelFreeOrder,
  deleteCampaign,
  deleteTicketType,
  getAttendees,
  getCampaignAnalytics,
  getCampaigns,
  getCities,
  getEvent,
  getEventOrders,
  getTicketTypes,
  saveCampaign,
  saveTicketType,
  updateEvent,
  type Attendee,
  type CampaignAnalytics,
  type City,
  type EventSummary,
  type Order,
  type PromoCampaign,
  type TicketType,
} from '../api/events'
import { apiBlob } from '../api/client'
import { getEventRefunds, refundOrder, type Refund } from '../api/platform'
import { assignEventStaff, getEventStaff as getStaff, removeEventStaff, type StaffAssignment } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { formatDateTime, formatKzt, saveBlob } from '../lib/format'
import { isMessageKey, useLocale } from '../lib/i18n'
import { AnalyticsTab } from './manage/AnalyticsTab'
import { HistoryTab } from './manage/HistoryTab'
import { PaidSalesPanel } from './manage/PaidSalesPanel'
import { SeatingTab } from './manage/SeatingTab'

const tabs = ['Overview', 'Tickets', 'Seating', 'Campaigns', 'Attendees', 'Orders', 'Analytics', 'History', 'Team'] as const
type Tab = typeof tabs[number]

function localDateTime(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function ManageEvent() {
  const { eventId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((tabs.find((item) => item.toLowerCase() === searchParams.get('tab')) ?? 'Overview') as Tab)
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { t } = useLocale()

  useEffect(() => {
    let active = true
    getEvent(eventId)
      .then((value) => { if (active) setEvent(value) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('event.loadError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [eventId, t])

  function switchTab(nextTab: Tab) {
    setTab(nextTab)
    setSearchParams(nextTab === 'Overview' ? {} : { tab: nextTab.toLowerCase() }, { replace: true })
    setError('')
    setMessage('')
  }

  if (loading) return <p className="text-slate-500">{t('manageEvent.loading')}</p>
  if (error && !event) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p>
  if (!event) return null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/events" className="text-sm font-semibold text-indigo-700 hover:underline">{t('manageEvent.back')}</Link>
          <p className="mt-4 text-sm font-semibold text-indigo-600">{t('events.organizerKicker')}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{event.title}{event.lifecycleStatus && <span className="ml-3 rounded-full bg-slate-100 px-3 py-1 align-middle text-xs font-bold text-slate-600">{t(`dashboard.lifecycle.${event.lifecycleStatus}`)}</span>}</h1>
          {event.isSuspended && <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t('manageEvent.suspended')}</p>}
          <p className="mt-2 text-sm text-slate-500">{formatDateTime(event.startDateUtc)} · {event.venue}{event.city ? `, ${event.city}` : ''}</p>
        </div>
        <Link to={`/events/${event.id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('manageEvent.preview')}</Link>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {tabs.map((item) => <button key={item} onClick={() => switchTab(item)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t(`manageEvent.tab.${item}`)}</button>)}
      </div>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {tab === 'Overview' && <Overview event={event} onUpdate={setEvent} onError={setError} onMessage={setMessage} />}
      {tab === 'Tickets' && <Tickets eventId={eventId} event={event} onError={setError} onMessage={setMessage} />}
      {tab === 'Seating' && <SeatingTab eventId={eventId} onError={setError} onMessage={setMessage} />}
      {tab === 'Analytics' && <AnalyticsTab eventId={eventId} onError={setError} />}
      {tab === 'History' && <HistoryTab eventId={eventId} onError={setError} />}
      {tab === 'Campaigns' && <Campaigns eventId={eventId} onError={setError} onMessage={setMessage} />}
      {tab === 'Attendees' && <Attendees eventId={eventId} onError={setError} />}
      {tab === 'Orders' && <EventOrders eventId={eventId} onError={setError} />}
      {tab === 'Team' && <Team eventId={eventId} onError={setError} onMessage={setMessage} />}
    </div>
  )
}

function Overview({ event, onUpdate, onError, onMessage }: {
  event: EventSummary
  onUpdate: (event: EventSummary) => void
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
      const startDateUtc = new Date(String(data.get('start'))).toISOString()
      const endDateUtc = new Date(String(data.get('end'))).toISOString()
      const saved = await updateEvent(event.id, {
        title: String(data.get('title')),
        description: String(data.get('description')),
        venue: String(data.get('venue')),
        cityId: Number(data.get('cityId')),
        category: String(data.get('category')) || null,
        startDateUtc,
        endDateUtc,
        isPublished: data.get('published') === 'on',
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
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <form onSubmit={(ev) => void submit(ev)} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div><h2 className="text-xl font-bold">{t('manageEvent.detailsTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.detailsText')}</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">{t('manageEvent.eventTitle')}<input name="title" required minLength={3} defaultValue={event.title} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium sm:col-span-2">{t('createEvent.description')}<textarea name="description" required minLength={20} rows={4} defaultValue={event.description} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('event.venue')}<input name="venue" required defaultValue={event.venue} className={`${inputClass} mt-1.5`} /></label>
          {/* The select mounts only after cities load, so defaultValue can preselect the event's city. */}
          {citiesError ? (
            <p role="alert" className="text-sm text-rose-600">{t('createEvent.citiesError', { error: citiesError })}</p>
          ) : cities ? (
            <label className="text-sm font-medium">{t('createEvent.city')}<select name="cityId" required defaultValue={String(event.cityId)} className={`${inputClass} mt-1.5`}><option value="">{t('createEvent.chooseCity')}</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          ) : (
            <p className="text-sm text-slate-500">{t('createEvent.loadingCities')}</p>
          )}
          <label className="text-sm font-medium">{t('manageEvent.venueAddress')}<input name="venueAddress" maxLength={300} defaultValue={event.venueAddress ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('manageEvent.timezone')}<input name="timezone" placeholder="Asia/Almaty" defaultValue={event.timezone ?? 'Asia/Almaty'} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('createEvent.category')}<input name="category" defaultValue={event.category ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('createEvent.visibility')}<select name="visibility" defaultValue={event.visibility ?? 'Public'} className={`${inputClass} mt-1.5`}><option value="Public">{t('createEvent.visibility.Public')}</option><option value="Unlisted">{t('createEvent.visibility.Unlisted')}</option><option value="Private">{t('createEvent.visibility.Private')}</option></select></label>
          <label className="text-sm font-medium">{t('createEvent.starts')}<input name="start" required type="datetime-local" defaultValue={localDateTime(event.startDateUtc)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('createEvent.ends')}<input name="end" required type="datetime-local" defaultValue={localDateTime(event.endDateUtc)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('manageEvent.capacity')}<input name="capacity" type="number" min={1} defaultValue={event.capacity ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('event.opens')}<input name="opens" type="datetime-local" defaultValue={localDateTime(event.registrationOpensAt)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('event.closes')}<input name="closes" type="datetime-local" defaultValue={localDateTime(event.registrationClosesAt)} className={`${inputClass} mt-1.5`} /></label>
        </div>
        <label className="block text-sm font-medium">{t('manageEvent.refundPolicy')}<textarea name="refundPolicy" rows={3} maxLength={2000} defaultValue={event.refundPolicy ?? ''} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm font-medium">{t('manageEvent.imageUrls')}<textarea name="imageUrls" rows={2} defaultValue={(event.imageUrls ?? []).join('\n')} className={`${inputClass} mt-1.5`} /></label>
        <label className="flex items-center gap-2 text-sm font-medium"><input name="published" type="checkbox" defaultChecked={event.isPublished} className="size-4 accent-indigo-600" /> {t('manageEvent.published')}</label>
        <button disabled={busy || !cities} className={buttonClass}>{busy ? t('common.saving') : t('manageEvent.save')}</button>
      </form>
      <PaidSalesPanel event={event} onStatus={(paidSalesStatus) => onUpdate({ ...event, paidSalesStatus })} onError={onError} onMessage={onMessage} />
    </section>
  )
}

function Tickets({ eventId, event, onError, onMessage }: {
  eventId: string
  event: EventSummary
  onError: (value: string) => void
  onMessage: (value: string) => void
}) {
  const [types, setTypes] = useState<TicketType[]>([])
  const [editing, setEditing] = useState<TicketType | null>(null)
  const [busy, setBusy] = useState(false)
  const { t } = useLocale()
  useEffect(() => {
    getTicketTypes(eventId).then(setTypes).catch((err: unknown) => onError(err instanceof Error ? err.message : t('manageEvent.ticketsLoadError')))
  }, [eventId, onError, t])

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    onError('')
    setBusy(true)
    try {
      const saved = await saveTicketType(eventId, {
        name: String(data.get('name')),
        description: String(data.get('description')) || null,
        price: Number(data.get('price')),
        quantity: Number(data.get('quantity')),
        salesStartAt: data.get('salesStartAt') ? new Date(String(data.get('salesStartAt'))).toISOString() : null,
        salesEndAt: data.get('salesEndAt') ? new Date(String(data.get('salesEndAt'))).toISOString() : null,
        maxPerOrder: Number(data.get('maxPerOrder')),
        isHidden: data.get('hidden') === 'on',
      }, editing?.id)
      setTypes((current) => editing ? current.map((type) => type.id === saved.id ? saved : type) : [...current, saved])
      setEditing(null)
      onMessage(editing ? t('manageEvent.typeUpdated') : t('manageEvent.typeCreated'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.typeSaveError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(ticketTypeId: string) {
    onError('')
    try {
      await deleteTicketType(eventId, ticketTypeId)
      setTypes((current) => current.filter((type) => type.id !== ticketTypeId))
      onMessage(t('manageEvent.typeDeleted'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.typeDeleteError'))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-bold">{t('manageEvent.inventoryTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.inventoryText', { title: event.title })}</p></div><span className="text-sm text-slate-500">{t('manageEvent.typeCount', { count: types.length })}</span></div>
        {types.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('manageEvent.noTypes')}</p> : types.map((type) => (
          <article key={type.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div><div className="flex items-center gap-2"><h3 className="font-bold">{type.name}</h3>{type.isHidden && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('manageEvent.hidden')}</span>}</div><p className="mt-1 text-sm text-slate-500">{type.price ? formatKzt(type.price) : t('event.free')} · {t('manageEvent.typeStats', { available: type.availableQuantity, reserved: type.reservedQuantity, sold: type.soldQuantity, refunded: type.refundedQuantity, checkedIn: type.checkedInQuantity })}</p></div>
            <div className="flex gap-2"><button onClick={() => setEditing(type)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t('common.edit')}</button><button onClick={() => void remove(type.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t('common.delete')}</button></div>
          </article>
        ))}
      </section>
      <form key={editing?.id ?? 'new'} onSubmit={(ev) => void save(ev)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">{editing ? t('manageEvent.editType') : t('manageEvent.addType')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.typeHint')}</p></div>
        <label className="block text-sm font-medium">{t('manageEvent.typeName')}<input required maxLength={120} name="name" defaultValue={editing?.name ?? ''} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm font-medium">{t('createEvent.description')}<textarea maxLength={1000} name="description" defaultValue={editing?.description ?? ''} rows={2} className={`${inputClass} mt-1.5`} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">{t('manageEvent.price')}<input required type="number" min={0} step="0.01" name="price" defaultValue={editing?.price ?? 0} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('manageEvent.quantity')}<input required type="number" min={1} name="quantity" defaultValue={editing?.quantity ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('manageEvent.maxPerOrder')}<input required type="number" min={1} max={100} name="maxPerOrder" defaultValue={editing?.maxPerOrder ?? 10} className={`${inputClass} mt-1.5`} /></label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input name="hidden" type="checkbox" defaultChecked={editing?.isHidden ?? false} className="accent-indigo-600" /> {t('manageEvent.hide')}</label>
          <label className="text-sm font-medium">{t('manageEvent.salesStart')}<input type="datetime-local" name="salesStartAt" defaultValue={localDateTime(editing?.salesStartAt)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('manageEvent.salesEnd')}<input type="datetime-local" name="salesEndAt" defaultValue={localDateTime(editing?.salesEndAt)} className={`${inputClass} mt-1.5`} /></label>
        </div>
        <button disabled={busy} className={`${buttonClass} w-full`}>{busy ? t('common.saving') : editing ? t('manageEvent.saveType') : t('manageEvent.addType')}</button>
        {editing && <button type="button" onClick={() => setEditing(null)} className="w-full text-sm font-semibold text-slate-500">{t('manageEvent.cancelEditing')}</button>}
      </form>
    </div>
  )
}

function Campaigns({ eventId, onError, onMessage }: { eventId: string; onError: (value: string) => void; onMessage: (value: string) => void }) {
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([])
  const [analytics, setAnalytics] = useState<CampaignAnalytics[]>([])
  const [editing, setEditing] = useState<PromoCampaign | null>(null)
  const [busy, setBusy] = useState(false)
  const [tickets, setTickets] = useState<TicketType[]>([])
  const { t } = useLocale()
  const refresh = useCallback(async () => {
    const [campaignRows, analyticsRows, ticketRows] = await Promise.all([getCampaigns(eventId), getCampaignAnalytics(eventId), getTicketTypes(eventId)])
    setCampaigns(campaignRows)
    setAnalytics(analyticsRows)
    setTickets(ticketRows)
  }, [eventId])
  useEffect(() => {
    let active = true
    Promise.all([getCampaigns(eventId), getCampaignAnalytics(eventId), getTicketTypes(eventId)])
      .then(([campaignRows, analyticsRows, ticketRows]) => {
        if (!active) return
        setCampaigns(campaignRows)
        setAnalytics(analyticsRows)
        setTickets(ticketRows)
      })
      .catch((err: unknown) => {
        if (active) onError(err instanceof Error ? err.message : t('manageEvent.campaignsLoadError'))
      })
    return () => { active = false }
  }, [eventId, onError, t])

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    setBusy(true)
    onError('')
    try {
      await saveCampaign(eventId, {
        code: String(data.get('code')).trim().toUpperCase(),
        discountType: String(data.get('discountType')) as 'Percentage' | 'FixedKzt',
        discountValue: Number(data.get('discountValue')),
        startsAt: data.get('startsAt') ? new Date(String(data.get('startsAt'))).toISOString() : null,
        endsAt: data.get('endsAt') ? new Date(String(data.get('endsAt'))).toISOString() : null,
        maxRedemptions: data.get('maxRedemptions') ? Number(data.get('maxRedemptions')) : null,
        ticketTypeIds: data.getAll('ticketTypeIds').map(String),
      }, editing?.id)
      setEditing(null)
      await refresh()
      onMessage(editing ? t('manageEvent.campaignUpdated') : t('manageEvent.campaignCreated'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.campaignSaveError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(campaignId: string) {
    onError('')
    try {
      await deleteCampaign(eventId, campaignId)
      await refresh()
      onMessage(t('manageEvent.campaignRemoved'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.campaignRemoveError'))
    }
  }

  async function downloadQr(campaignId: string) {
    onError('')
    try {
      const image = await apiBlob(`/api/events/${eventId}/campaigns/${campaignId}/qr`)
      saveBlob(image, `campaign-${campaignId}.png`)
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.qrError'))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3">
        <div><h2 className="text-xl font-bold">{t('manageEvent.campaignsTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.campaignsText')}</p></div>
        {campaigns.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('manageEvent.noCampaigns')}</p>}
        {campaigns.map((campaign) => {
          const stats = analytics.find((item) => item.campaignId === campaign.id)
          return <article key={campaign.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><h3 className="font-bold">{campaign.code}</h3><span className={`rounded-full px-2 py-1 text-xs font-semibold ${campaign.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{campaign.isEnabled ? t('manageEvent.active') : t('manageEvent.disabled')}</span></div><p className="mt-1 text-sm text-slate-500">{campaign.discountType === 'Percentage' ? t('manageEvent.percentOff', { value: campaign.discountValue }) : t('manageEvent.amountOff', { amount: formatKzt(campaign.discountValue) })} · {t('manageEvent.redemptions', { count: campaign.redemptions })}</p></div>
              <div className="flex gap-2"><button onClick={() => setEditing(campaign)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t('common.edit')}</button><button onClick={() => void remove(campaign.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t('manageEvent.disable')}</button></div>
            </div>
            <p className="mt-3 break-all text-xs text-slate-500">{campaign.campaignUrl}</p>
            <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void navigator.clipboard.writeText(campaign.campaignUrl)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">{t('manageEvent.copyLink')}</button><button onClick={() => void downloadQr(campaign.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">{t('manageEvent.downloadQr')}</button></div>
            {stats && <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center"><p><strong className="block">{stats.ticketsSold}</strong><span className="text-xs text-slate-500">{t('manageEvent.statTickets')}</span></p><p><strong className="block">{formatKzt(stats.grossRevenue)}</strong><span className="text-xs text-slate-500">{t('manageEvent.statGross')}</span></p><p><strong className="block">{formatKzt(stats.netRevenue)}</strong><span className="text-xs text-slate-500">{t('manageEvent.statNet')}</span></p></div>}
          </article>
        })}
      </section>
      <form key={editing?.id ?? 'new-campaign'} onSubmit={(ev) => void save(ev)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">{editing ? t('manageEvent.editCampaign') : t('manageEvent.createCampaign')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.campaignHint')}</p></div>
        <label className="block text-sm font-medium">{t('event.promo')}<input required maxLength={40} name="code" defaultValue={editing?.code ?? ''} className={`${inputClass} mt-1.5`} /></label>
        <div className="grid grid-cols-[1fr_130px] gap-3">
          <label className="text-sm font-medium">{t('manageEvent.discountType')}<select name="discountType" defaultValue={editing?.discountType ?? 'Percentage'} className={`${inputClass} mt-1.5`}><option value="Percentage">{t('manageEvent.discount.Percentage')}</option><option value="FixedKzt">{t('manageEvent.discount.FixedKzt')}</option></select></label>
          <label className="text-sm font-medium">{t('manageEvent.value')}<input required type="number" min="0.01" step="0.01" name="discountValue" defaultValue={editing?.discountValue ?? ''} className={`${inputClass} mt-1.5`} /></label>
        </div>
        <label className="block text-sm font-medium">{t('manageEvent.maxRedemptions')}<input type="number" min="1" name="maxRedemptions" defaultValue={editing?.maxRedemptions ?? ''} className={`${inputClass} mt-1.5`} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">{t('createEvent.starts')}<input type="datetime-local" name="startsAt" defaultValue={localDateTime(editing?.startsAt)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">{t('createEvent.ends')}<input type="datetime-local" name="endsAt" defaultValue={localDateTime(editing?.endsAt)} className={`${inputClass} mt-1.5`} /></label>
        </div>
        {tickets.length > 0 && <fieldset><legend className="text-sm font-medium">{t('manageEvent.appliesTo')}</legend><div className="mt-2 space-y-2">{tickets.map((ticket) => <label key={ticket.id} className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="ticketTypeIds" value={ticket.id} defaultChecked={editing?.ticketTypeIds.includes(ticket.id)} className="accent-indigo-600" />{ticket.name}</label>)}</div><p className="mt-2 text-xs text-slate-400">{t('manageEvent.appliesHint')}</p></fieldset>}
        <button disabled={busy} className={`${buttonClass} w-full`}>{busy ? t('common.saving') : editing ? t('manageEvent.saveCampaign') : t('manageEvent.createCampaign')}</button>
        {editing && <button type="button" onClick={() => setEditing(null)} className="w-full text-sm font-semibold text-slate-500">{t('manageEvent.cancelEditing')}</button>}
      </form>
    </div>
  )
}

function Attendees({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useLocale()
  const statusLabel = (key: string, fallback: string) => (isMessageKey(key) ? t(key) : fallback)
  useEffect(() => {
    let active = true
    getAttendees(eventId, search).then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.attendeesLoadError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [eventId, onError, search, t])
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">{t('manageEvent.attendeesTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.attendeesText')}</p></div><input aria-label={t('manageEvent.searchAttendees')} value={search} onChange={(ev) => { setLoading(true); setSearch(ev.target.value) }} placeholder={t('manageEvent.searchAttendees')} className={`${inputClass} max-w-sm`} /></div>
      {loading ? <p className="py-8 text-center text-sm text-slate-500">{t('manageEvent.searching')}</p> : rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{t('manageEvent.noAttendees')}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">{t('role.Attendee')}</th><th className="p-3">{t('manageEvent.ticket')}</th><th className="p-3">{t('common.status')}</th><th className="p-3">{t('orders.order')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.ticketId} className="border-t border-slate-100"><td className="p-3"><strong>{row.attendeeName}</strong><span className="block text-xs text-slate-500">{row.attendeeEmail}</span></td><td className="p-3">{row.ticketTypeName}</td><td className="p-3">{statusLabel(`orders.ticketStatus.${row.status}`, row.status)}</td><td className="p-3 font-mono text-xs">{row.orderId.slice(0, 8)}</td></tr>)}</tbody></table></div>}
    </section>
  )
}

function EventOrders({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [busyOrder, setBusyOrder] = useState('')
  const [refunding, setRefunding] = useState('')
  const [reason, setReason] = useState('')
  const { t } = useLocale()
  const statusLabel = (key: string, fallback: string) => (isMessageKey(key) ? t(key) : fallback)
  useEffect(() => {
    Promise.all([getEventOrders(eventId), getEventRefunds(eventId)])
      .then(([orderRows, refundRows]) => { setOrders(orderRows); setRefunds(refundRows) })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : t('manageEvent.ordersLoadError')))
  }, [eventId, onError, t])

  async function update(orderId: string, action: () => Promise<Order>, failure: string) {
    onError('')
    setBusyOrder(orderId)
    try {
      const updated = await action()
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order))
      setRefunds(await getEventRefunds(eventId))
      setRefunding('')
      setReason('')
    } catch (err) {
      onError(err instanceof Error ? err.message : failure)
    } finally {
      setBusyOrder('')
    }
  }

  const settled = orders.filter((order) => order.status === 'Confirmed' || order.status === 'Refunded')
  const gross = settled.reduce((sum, order) => sum + order.total + order.discountTotal, 0)
  const discounts = settled.reduce((sum, order) => sum + order.discountTotal, 0)
  const fees = orders.filter((order) => order.status === 'Confirmed').reduce((sum, order) => sum + order.feeTotal, 0)
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0)
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {([[t('analytics.grossSales'), gross], [t('analytics.discounts'), discounts], [t('analytics.fees'), fees], [t('analytics.refunds'), refunded], [t('analytics.payout'), gross - discounts - fees - refunded]] as [string, number][]).map(([label, amount]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-black">{formatKzt(amount)}</p><p className="text-xs text-slate-400">{t('manageEvent.demoOnly')}</p></div>
        ))}
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-xl font-bold">{t('manageEvent.tab.Orders')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.ordersText')}</p></div>
        {orders.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{t('manageEvent.noOrders')}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">{t('orders.order')}</th><th className="p-3">{t('role.Attendee')}</th><th className="p-3">{t('manageEvent.tickets')}</th><th className="p-3">{t('event.total')}</th><th className="p-3">{t('common.status')}</th><th className="p-3">{t('common.action')}</th></tr></thead><tbody>{orders.map((order) => (
          <tr key={order.id} className="border-t border-slate-100 align-top">
            <td className="p-3 font-mono text-xs">{order.id.slice(0, 8)}<span className="block font-sans text-slate-400">{formatDateTime(order.createdAt)}</span></td>
            <td className="p-3">{order.items[0]?.tickets[0]?.attendeeName ?? t('role.Attendee')}<span className="block text-xs text-slate-500">{order.items[0]?.tickets[0]?.attendeeEmail}</span></td>
            <td className="p-3">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
            <td className="p-3 font-semibold">{formatKzt(order.total)}{order.promoCode && <span className="block text-xs font-normal text-emerald-700">{order.promoCode} −{formatKzt(order.discountTotal)}</span>}</td>
            <td className="p-3">{statusLabel(`orders.status.${order.status}`, order.status)}</td>
            <td className="p-3">
              {order.status === 'Confirmed' && order.total === 0 && <button disabled={busyOrder === order.id} onClick={() => void update(order.id, () => cancelFreeOrder(eventId, order.id), t('manageEvent.cancelOrderError'))} className="text-xs font-semibold text-rose-700 hover:underline">{busyOrder === order.id ? t('manageEvent.cancelling') : t('manageEvent.cancelFree')}</button>}
              {order.status === 'Confirmed' && order.total > 0 && refunding !== order.id && <button onClick={() => { setRefunding(order.id); setReason('') }} className="text-xs font-semibold text-rose-700 hover:underline">{t('manageEvent.refundOrder')}</button>}
              {refunding === order.id && (
                <div className="space-y-2">
                  <input aria-label={t('manageEvent.refundReason')} value={reason} onChange={(change) => setReason(change.target.value)} maxLength={500} placeholder={t('manageEvent.reasonPlaceholder')} className={inputClass} />
                  <div className="flex gap-2"><button disabled={busyOrder === order.id} onClick={() => void update(order.id, () => refundOrder(eventId, order.id, reason.trim()), t('manageEvent.refundError'))} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white">{busyOrder === order.id ? t('manageEvent.refunding') : t('manageEvent.confirmRefund', { amount: formatKzt(order.total) })}</button><button onClick={() => setRefunding('')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">{t('manageEvent.keepOrder')}</button></div>
                </div>
              )}
            </td>
          </tr>
        ))}</tbody></table></div>}
      </section>
      {refunds.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">{t('analytics.refunds')}</h2>
          <ul className="divide-y divide-slate-100 text-sm">{refunds.map((refund) => <li key={refund.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-mono text-xs">{refund.orderId.slice(0, 8)}</span> · {formatDateTime(refund.createdAt)}{refund.reason ? ` · ${refund.reason}` : ''}</span><strong>{formatKzt(refund.amount)}{refund.isSimulated ? ` ${t('manageEvent.simulated')}` : ''}</strong></li>)}</ul>
        </section>
      )}
    </div>
  )
}

function Team({ eventId, onError, onMessage }: { eventId: string; onError: (value: string) => void; onMessage: (value: string) => void }) {
  const [staff, setStaff] = useState<StaffAssignment[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const { t } = useLocale()
  useEffect(() => {
    getStaff(eventId).then(setStaff).catch((err: unknown) => onError(err instanceof Error ? err.message : t('manageEvent.staffLoadError')))
  }, [eventId, onError, t])
  async function assign(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setBusy(true)
    onError('')
    try {
      await assignEventStaff(eventId, email)
      setEmail('')
      setStaff(await getStaff(eventId))
      onMessage(t('manageEvent.staffAssigned'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.assignError'))
    } finally {
      setBusy(false)
    }
  }
  async function remove(userId: string) {
    onError('')
    try {
      await removeEventStaff(eventId, userId)
      setStaff((current) => current.filter((row) => row.userId !== userId))
      onMessage(t('manageEvent.staffRemoved'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.removeError'))
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="text-xl font-bold">{t('manageEvent.staffTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('manageEvent.staffText')}</p></div>{staff.length === 0 ? <p className="py-6 text-sm text-slate-500">{t('manageEvent.noStaff')}</p> : staff.map((row) => <div key={row.userId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="font-semibold">{row.email}</p><p className="mt-1 text-xs text-slate-500">{t('manageEvent.assignedAt', { time: formatDateTime(row.assignedAt) })}</p></div><button onClick={() => void remove(row.userId)} className="text-sm font-semibold text-rose-700 hover:underline">{t('common.remove')}</button></div>)}</section>
      <form onSubmit={(ev) => void assign(ev)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="text-lg font-bold">{t('manageEvent.assignTitle')}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{t('manageEvent.assignText')}</p></div><label className="block text-sm font-medium">{t('manageEvent.accountEmail')}<input required type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} className={`${inputClass} mt-1.5`} /></label><button disabled={busy} className={buttonClass}>{busy ? t('manageEvent.assigning') : t('manageEvent.assign')}</button></form>
    </div>
  )
}
