import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  activatePaidSales,
  cancelFreeOrder,
  deleteCampaign,
  deleteTicketType,
  getAttendees,
  getCampaignAnalytics,
  getCampaigns,
  getEvent,
  getEventOrders,
  getTicketTypes,
  saveCampaign,
  saveTicketType,
  updateEvent,
  type Attendee,
  type CampaignAnalytics,
  type EventSummary,
  type Order,
  type PromoCampaign,
  type TicketType,
} from '../api/events'
import { apiBlob } from '../api/client'
import { assignEventStaff, getEventStaff as getStaff, removeEventStaff, type StaffAssignment } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { formatDateTime, formatKzt, saveBlob } from '../lib/format'

const tabs = ['Overview', 'Tickets', 'Campaigns', 'Attendees', 'Orders', 'Team'] as const
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

  useEffect(() => {
    let active = true
    getEvent(eventId)
      .then((value) => { if (active) setEvent(value) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load this event.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [eventId])

  function switchTab(nextTab: Tab) {
    setTab(nextTab)
    setSearchParams(nextTab === 'Overview' ? {} : { tab: nextTab.toLowerCase() }, { replace: true })
    setError('')
    setMessage('')
  }

  if (loading) return <p className="text-slate-500">Loading event workspace…</p>
  if (error && !event) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p>
  if (!event) return null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/events" className="text-sm font-semibold text-indigo-700 hover:underline">← Event portfolio</Link>
          <p className="mt-4 text-sm font-semibold text-indigo-600">Organizer workspace</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{event.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{formatDateTime(event.startDateUtc)} · {event.venue}{event.city ? `, ${event.city}` : ''}</p>
        </div>
        <Link to={`/events/${event.id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Preview event</Link>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {tabs.map((item) => <button key={item} onClick={() => switchTab(item)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{item}</button>)}
      </div>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {tab === 'Overview' && <Overview event={event} onUpdate={setEvent} onError={setError} onMessage={setMessage} />}
      {tab === 'Tickets' && <Tickets eventId={eventId} event={event} onError={setError} onMessage={setMessage} />}
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
  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    onError('')
    onMessage('')
    const data = new FormData(form.currentTarget)
    const startDateUtc = new Date(String(data.get('start'))).toISOString()
    const endDateUtc = new Date(String(data.get('end'))).toISOString()
    setBusy(true)
    try {
      const saved = await updateEvent(event.id, {
        title: String(data.get('title')),
        description: String(data.get('description')),
        venue: String(data.get('venue')),
        city: String(data.get('city')),
        category: String(data.get('category')) || null,
        startDateUtc,
        endDateUtc,
        isPublished: data.get('published') === 'on',
        visibility: String(data.get('visibility')) as EventSummary['visibility'],
        capacity: data.get('capacity') ? Number(data.get('capacity')) : null,
        registrationOpensAt: data.get('opens') ? new Date(String(data.get('opens'))).toISOString() : null,
        registrationClosesAt: data.get('closes') ? new Date(String(data.get('closes'))).toISOString() : null,
        imageUrls: event.imageUrls ?? [],
      })
      onUpdate(saved)
      onMessage('Event details saved.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save event details.')
    } finally {
      setBusy(false)
    }
  }

  async function activateSales() {
    onError('')
    onMessage('')
    setBusy(true)
    try {
      await activatePaidSales(event.id)
      onUpdate({ ...event, paidSalesStatus: 'Active' })
      onMessage('Paid sales simulation activated. This does not collect payment or configure real payouts.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not activate paid sales.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <form onSubmit={(ev) => void submit(ev)} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div><h2 className="text-xl font-bold">Event details</h2><p className="mt-1 text-sm text-slate-500">Keep your event information up to date for guests.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Event title<input name="title" required minLength={3} defaultValue={event.title} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium sm:col-span-2">Description<textarea name="description" required minLength={20} rows={4} defaultValue={event.description} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Venue<input name="venue" required defaultValue={event.venue} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">City<input name="city" required defaultValue={event.city} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Category<input name="category" defaultValue={event.category ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Visibility<select name="visibility" defaultValue={event.visibility ?? 'Public'} className={`${inputClass} mt-1.5`}><option>Public</option><option>Unlisted</option><option>Private</option></select></label>
          <label className="text-sm font-medium">Starts<input name="start" required type="datetime-local" defaultValue={localDateTime(event.startDateUtc)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Ends<input name="end" required type="datetime-local" defaultValue={localDateTime(event.endDateUtc)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Capacity (optional)<input name="capacity" type="number" min={1} defaultValue={event.capacity ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Registration opens<input name="opens" type="datetime-local" defaultValue={localDateTime(event.registrationOpensAt)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Registration closes<input name="closes" type="datetime-local" defaultValue={localDateTime(event.registrationClosesAt)} className={`${inputClass} mt-1.5`} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium"><input name="published" type="checkbox" defaultChecked={event.isPublished} className="size-4 accent-indigo-600" /> Publish event</label>
        <button disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save event details'}</button>
      </form>
      <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">Paid ticket sales</h2><p className="mt-1 text-sm leading-6 text-slate-500">Payment activation is a classroom simulation only. It does not verify identity, collect a fee, or configure payouts.</p></div>
        <p className="rounded-xl bg-slate-50 p-3 text-sm">Status: <strong>{event.paidSalesStatus ?? 'None'}</strong></p>
        {event.paidSalesStatus !== 'Active' && <button disabled={busy} onClick={() => void activateSales()} className="w-full rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Activate simulation</button>}
      </aside>
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
  useEffect(() => {
    getTicketTypes(eventId).then(setTypes).catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load ticket types.'))
  }, [eventId, onError])

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
      onMessage(`Ticket type ${editing ? 'updated' : 'created'}.`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save ticket type.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(ticketTypeId: string) {
    onError('')
    try {
      await deleteTicketType(eventId, ticketTypeId)
      setTypes((current) => current.filter((type) => type.id !== ticketTypeId))
      onMessage('Ticket type deleted.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete ticket type.')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-bold">Ticket inventory</h2><p className="mt-1 text-sm text-slate-500">Track sold, reserved, and remaining seats for {event.title}.</p></div><span className="text-sm text-slate-500">{types.length} types</span></div>
        {types.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Add a ticket type to begin registration.</p> : types.map((type) => (
          <article key={type.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div><div className="flex items-center gap-2"><h3 className="font-bold">{type.name}</h3>{type.isHidden && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Hidden</span>}</div><p className="mt-1 text-sm text-slate-500">{type.price ? formatKzt(type.price) : 'Free'} · {type.soldQuantity} sold · {type.reservedQuantity} reserved · {type.availableQuantity} remaining</p></div>
            <div className="flex gap-2"><button onClick={() => setEditing(type)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Edit</button><button onClick={() => void remove(type.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Delete</button></div>
          </article>
        ))}
      </section>
      <form key={editing?.id ?? 'new'} onSubmit={(ev) => void save(ev)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">{editing ? 'Edit ticket type' : 'Add ticket type'}</h2><p className="mt-1 text-sm text-slate-500">Free registration is supported; paid sales require simulation activation.</p></div>
        <label className="block text-sm font-medium">Name<input required maxLength={120} name="name" defaultValue={editing?.name ?? ''} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm font-medium">Description<textarea maxLength={1000} name="description" defaultValue={editing?.description ?? ''} rows={2} className={`${inputClass} mt-1.5`} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Price (KZT)<input required type="number" min={0} step="0.01" name="price" defaultValue={editing?.price ?? 0} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Quantity<input required type="number" min={1} name="quantity" defaultValue={editing?.quantity ?? ''} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Max per order<input required type="number" min={1} max={100} name="maxPerOrder" defaultValue={editing?.maxPerOrder ?? 10} className={`${inputClass} mt-1.5`} /></label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input name="hidden" type="checkbox" defaultChecked={editing?.isHidden ?? false} className="accent-indigo-600" /> Hide</label>
          <label className="text-sm font-medium">Sales start<input type="datetime-local" name="salesStartAt" defaultValue={localDateTime(editing?.salesStartAt)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Sales end<input type="datetime-local" name="salesEndAt" defaultValue={localDateTime(editing?.salesEndAt)} className={`${inputClass} mt-1.5`} /></label>
        </div>
        <button disabled={busy} className={`${buttonClass} w-full`}>{busy ? 'Saving…' : editing ? 'Save ticket type' : 'Add ticket type'}</button>
        {editing && <button type="button" onClick={() => setEditing(null)} className="w-full text-sm font-semibold text-slate-500">Cancel editing</button>}
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
        if (active) onError(err instanceof Error ? err.message : 'Could not load campaigns.')
      })
    return () => { active = false }
  }, [eventId, onError])

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
      onMessage(`Campaign ${editing ? 'updated' : 'created'}.`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save campaign.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(campaignId: string) {
    onError('')
    try {
      await deleteCampaign(eventId, campaignId)
      await refresh()
      onMessage('Campaign disabled or removed.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove campaign.')
    }
  }

  async function downloadQr(campaignId: string) {
    onError('')
    try {
      const image = await apiBlob(`/api/events/${eventId}/campaigns/${campaignId}/qr`)
      saveBlob(image, `campaign-${campaignId}.png`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not download campaign QR.')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3">
        <div><h2 className="text-xl font-bold">Promo campaigns</h2><p className="mt-1 text-sm text-slate-500">Share a code or campaign link; both are revalidated during checkout.</p></div>
        {campaigns.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No campaigns yet. Create a discount to share with guests.</p>}
        {campaigns.map((campaign) => {
          const stats = analytics.find((item) => item.campaignId === campaign.id)
          return <article key={campaign.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><h3 className="font-bold">{campaign.code}</h3><span className={`rounded-full px-2 py-1 text-xs font-semibold ${campaign.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{campaign.isEnabled ? 'Active' : 'Disabled'}</span></div><p className="mt-1 text-sm text-slate-500">{campaign.discountType === 'Percentage' ? `${campaign.discountValue}% off` : `${formatKzt(campaign.discountValue)} off`} · {campaign.redemptions} redemptions</p></div>
              <div className="flex gap-2"><button onClick={() => setEditing(campaign)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Edit</button><button onClick={() => void remove(campaign.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Disable</button></div>
            </div>
            <p className="mt-3 break-all text-xs text-slate-500">{campaign.campaignUrl}</p>
            <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void navigator.clipboard.writeText(campaign.campaignUrl)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Copy link</button><button onClick={() => void downloadQr(campaign.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Download campaign QR</button></div>
            {stats && <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center"><p><strong className="block">{stats.ticketsSold}</strong><span className="text-xs text-slate-500">tickets</span></p><p><strong className="block">{formatKzt(stats.grossRevenue)}</strong><span className="text-xs text-slate-500">gross</span></p><p><strong className="block">{formatKzt(stats.netRevenue)}</strong><span className="text-xs text-slate-500">net</span></p></div>}
          </article>
        })}
      </section>
      <form key={editing?.id ?? 'new-campaign'} onSubmit={(ev) => void save(ev)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">{editing ? 'Edit campaign' : 'Create campaign'}</h2><p className="mt-1 text-sm text-slate-500">Analytics are calculated from confirmed orders.</p></div>
        <label className="block text-sm font-medium">Promo code<input required maxLength={40} name="code" defaultValue={editing?.code ?? ''} className={`${inputClass} mt-1.5`} /></label>
        <div className="grid grid-cols-[1fr_130px] gap-3">
          <label className="text-sm font-medium">Discount type<select name="discountType" defaultValue={editing?.discountType ?? 'Percentage'} className={`${inputClass} mt-1.5`}><option value="Percentage">Percent</option><option value="FixedKzt">Fixed KZT</option></select></label>
          <label className="text-sm font-medium">Value<input required type="number" min="0.01" step="0.01" name="discountValue" defaultValue={editing?.discountValue ?? ''} className={`${inputClass} mt-1.5`} /></label>
        </div>
        <label className="block text-sm font-medium">Max redemptions (optional)<input type="number" min="1" name="maxRedemptions" defaultValue={editing?.maxRedemptions ?? ''} className={`${inputClass} mt-1.5`} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Starts<input type="datetime-local" name="startsAt" defaultValue={localDateTime(editing?.startsAt)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">Ends<input type="datetime-local" name="endsAt" defaultValue={localDateTime(editing?.endsAt)} className={`${inputClass} mt-1.5`} /></label>
        </div>
        {tickets.length > 0 && <fieldset><legend className="text-sm font-medium">Applies to ticket types</legend><div className="mt-2 space-y-2">{tickets.map((ticket) => <label key={ticket.id} className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="ticketTypeIds" value={ticket.id} defaultChecked={editing?.ticketTypeIds.includes(ticket.id)} className="accent-indigo-600" />{ticket.name}</label>)}</div><p className="mt-2 text-xs text-slate-400">Leave all unchecked to apply to every ticket type.</p></fieldset>}
        <button disabled={busy} className={`${buttonClass} w-full`}>{busy ? 'Saving…' : editing ? 'Save campaign' : 'Create campaign'}</button>
        {editing && <button type="button" onClick={() => setEditing(null)} className="w-full text-sm font-semibold text-slate-500">Cancel editing</button>}
      </form>
    </div>
  )
}

function Attendees({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    getAttendees(eventId, search).then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load attendees.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [eventId, onError, search])
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Attendee list</h2><p className="mt-1 text-sm text-slate-500">Search ticket holders by name or email.</p></div><input aria-label="Search attendees" value={search} onChange={(ev) => { setLoading(true); setSearch(ev.target.value) }} placeholder="Search attendees" className={`${inputClass} max-w-sm`} /></div>
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Searching…</p> : rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No attendee tickets found.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">Attendee</th><th className="p-3">Ticket</th><th className="p-3">Status</th><th className="p-3">Order</th></tr></thead><tbody>{rows.map((row) => <tr key={row.ticketId} className="border-t border-slate-100"><td className="p-3"><strong>{row.attendeeName}</strong><span className="block text-xs text-slate-500">{row.attendeeEmail}</span></td><td className="p-3">{row.ticketTypeName}</td><td className="p-3">{row.status}</td><td className="p-3 font-mono text-xs">{row.orderId.slice(0, 8)}</td></tr>)}</tbody></table></div>}
    </section>
  )
}

function EventOrders({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [busyOrder, setBusyOrder] = useState('')
  useEffect(() => {
    getEventOrders(eventId).then(setOrders)
      .catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load event orders.'))
  }, [eventId, onError])
  async function cancelOrder(orderId: string) {
    onError('')
    setBusyOrder(orderId)
    try {
      const cancelled = await cancelFreeOrder(eventId, orderId)
      setOrders((current) => current.map((order) => order.id === cancelled.id ? cancelled : order))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not cancel this order.')
    } finally {
      setBusyOrder('')
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="text-xl font-bold">Orders</h2><p className="mt-1 text-sm text-slate-500">Reservations and payment status for this event.</p></div>
      {orders.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No orders yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">Order</th><th className="p-3">Attendee</th><th className="p-3">Tickets</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-slate-100"><td className="p-3 font-mono text-xs">{order.id.slice(0, 8)}</td><td className="p-3">{order.items[0]?.tickets[0]?.attendeeName ?? 'Attendee'}</td><td className="p-3">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td className="p-3 font-semibold">{formatKzt(order.total)}</td><td className="p-3">{order.status}</td><td className="p-3">{order.status === 'Confirmed' && order.total === 0 && <button disabled={busyOrder === order.id} onClick={() => void cancelOrder(order.id)} className="text-xs font-semibold text-rose-700 hover:underline">{busyOrder === order.id ? 'Cancelling…' : 'Cancel free order'}</button>}</td></tr>)}</tbody></table></div>}
    </section>
  )
}

function Team({ eventId, onError, onMessage }: { eventId: string; onError: (value: string) => void; onMessage: (value: string) => void }) {
  const [staff, setStaff] = useState<StaffAssignment[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getStaff(eventId).then(setStaff).catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load event staff.'))
  }, [eventId, onError])
  async function assign(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setBusy(true)
    onError('')
    try {
      await assignEventStaff(eventId, email)
      setEmail('')
      setStaff(await getStaff(eventId))
      onMessage('Event administrator assigned.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not assign event administrator.')
    } finally {
      setBusy(false)
    }
  }
  async function remove(userId: string) {
    onError('')
    try {
      await removeEventStaff(eventId, userId)
      setStaff((current) => current.filter((row) => row.userId !== userId))
      onMessage('Event administrator removed.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove event administrator.')
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="text-xl font-bold">Event administrators</h2><p className="mt-1 text-sm text-slate-500">Assigned staff can validate tickets and record event check-ins.</p></div>{staff.length === 0 ? <p className="py-6 text-sm text-slate-500">No staff members assigned.</p> : staff.map((row) => <div key={row.userId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="font-semibold">{row.email}</p><p className="mt-1 text-xs text-slate-500">Assigned {formatDateTime(row.assignedAt)}</p></div><button onClick={() => void remove(row.userId)} className="text-sm font-semibold text-rose-700 hover:underline">Remove</button></div>)}</section>
      <form onSubmit={(ev) => void assign(ev)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="text-lg font-bold">Assign staff</h2><p className="mt-1 text-sm leading-6 text-slate-500">The account must be active and have a verified email address.</p></div><label className="block text-sm font-medium">Account email<input required type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} className={`${inputClass} mt-1.5`} /></label><button disabled={busy} className={buttonClass}>{busy ? 'Assigning…' : 'Assign event admin'}</button></form>
    </div>
  )
}
