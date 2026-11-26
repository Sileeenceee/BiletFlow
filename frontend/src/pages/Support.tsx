import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { addSupportMessage, createSupportCase, getNotifications, getSupportCases, markNotificationRead, updateSupportCase, type SupportCase } from '../api/workflows'
import { getEvents, getMyOrders, type Order } from '../api/events'
import { escalateSupportCase } from '../api/platform'
import { Badge } from '../components/EventCard'
import { ChatIcon, PlusIcon, TicketIcon } from '../components/icons'
import { inputClass } from '../components/form'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateTime } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'

// Category and status values are what the API stores; only their labels are translated.
const categoryKeys: Record<string, MessageKey> = {
  'Ticket delivery': 'support.categories.ticketDelivery',
  Payment: 'support.categories.payment',
  Refund: 'support.categories.refund',
  Seating: 'support.categories.seating',
  'Event information': 'support.categories.eventInfo',
  'Check-in': 'support.categories.checkIn',
  Account: 'support.categories.account',
  'Technical problem': 'support.categories.technical',
  Activation: 'support.categories.activation',
}
const attendeeCategories = ['Ticket delivery', 'Payment', 'Refund', 'Seating', 'Event information', 'Check-in', 'Account', 'Technical problem']
const organizerCategories = ['Account', 'Activation', 'Payment', 'Technical problem']

const statusKeys: Record<string, MessageKey> = {
  Open: 'support.status.open',
  'In Progress': 'support.status.inProgress',
  'Waiting for Customer': 'support.status.waiting',
  Resolved: 'support.status.resolved',
}

const statusTone = (status: string): 'cyan' | 'amber' | 'slate' | 'green' =>
  status === 'Resolved' ? 'green' : status === 'In Progress' ? 'amber' : status === 'Waiting for Customer' ? 'slate' : 'cyan'

const roleKeys: Record<string, MessageKey> = {
  Attendee: 'role.Attendee',
  Organizer: 'role.Organizer',
  EventAdmin: 'role.EventAdmin',
  PlatformAdmin: 'role.PlatformAdmin',
}

type Notification = Awaited<ReturnType<typeof getNotifications>>[number]

export default function Support() {
  const { user } = useAuth()
  const { t } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cases, setCases] = useState<SupportCase[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [selected, setSelected] = useState<SupportCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createMode, setCreateMode] = useState(searchParams.get('new') === '1')
  const [reply, setReply] = useState('')
  const isStaff = user?.role === 'PlatformAdmin' || user?.role === 'Organizer'
  const canOpenCase = user?.role === 'Attendee' || user?.role === 'Organizer' || user?.role === 'EventAdmin'
  const categories = user?.role === 'Organizer' ? organizerCategories : attendeeCategories
  // Opened from an event, order or ticket page: that context is attached and cannot be changed here.
  const linkContext = Boolean(searchParams.get('eventId') || searchParams.get('orderId') || searchParams.get('ticketId'))

  const refresh = useCallback(async () => {
    const [caseRows, notificationRows] = await Promise.all([getSupportCases(), getNotifications()])
    setCases(caseRows)
    setNotifications(notificationRows)
    setSelected((current) => (current ? (caseRows.find((row) => row.id === current.id) ?? null) : null))
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([getSupportCases(), getNotifications()])
      .then(([caseRows, notificationRows]) => {
        if (!active) return
        setCases(caseRows)
        setNotifications(notificationRows)
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('support.loadError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('support.refreshError'))
      })
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh, t])

  const caseId = searchParams.get('caseId')
  const activeCase = (caseId ? cases.find((item) => item.id === caseId) : null) ?? selected

  function selectCase(item: SupportCase | null) {
    if (caseId) {
      const next = new URLSearchParams(searchParams)
      next.delete('caseId')
      setSearchParams(next, { replace: true })
    }
    setSelected(item)
  }

  async function openCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const subject = String(data.get('subject') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    if (!subject || !message) {
      setError(t('auth.required'))
      return
    }
    setError('')
    setBusy(true)
    try {
      const created = await createSupportCase({
        category: String(data.get('category')),
        subject,
        message,
        eventId: searchParams.get('eventId') ?? (String(data.get('eventId') ?? '') || undefined),
        orderId: searchParams.get('orderId') ?? (String(data.get('orderId') ?? '') || undefined),
        ticketId: searchParams.get('ticketId') ?? undefined,
      })
      await refresh()
      setSelected(created)
      setCreateMode(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('support.openError'))
    } finally {
      setBusy(false)
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeCase) return
    const body = reply.trim()
    if (!body) return
    setError('')
    setBusy(true)
    try {
      const updated = await addSupportMessage(activeCase.id, body)
      setSelected(updated)
      setReply('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('support.replyError'))
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(status: string) {
    if (!activeCase) return
    setError('')
    try {
      const updated = await updateSupportCase(activeCase.id, status)
      setSelected(updated)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('support.statusError'))
    }
  }

  async function escalate() {
    if (!activeCase) return
    setError('')
    try {
      await escalateSupportCase(activeCase.id, '')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('support.escalateError'))
    }
  }

  async function readNotification(item: Notification) {
    setError('')
    try {
      if (!item.readAt) await markNotificationRead(item.id)
      if (item.relatedCaseId) selectCase(cases.find((supportCase) => supportCase.id === item.relatedCaseId) ?? null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('support.notificationError'))
    }
  }

  if (loading) return <p className="text-slate-500">{t('support.loading')}</p>
  const unreadNotifications = notifications.filter((item) => !item.readAt)
  const statusLabel = (status: string) => statusKeys[status] ? t(statusKeys[status]) : status
  const categoryLabel = (category: string) => categoryKeys[category] ? t(categoryKeys[category]) : category
  const contextItems = [searchParams.get('eventId') && t('support.relatedEvent'), searchParams.get('orderId') && t('support.relatedOrder'), searchParams.get('ticketId') && t('support.relatedTicket')].filter(Boolean).join(', ')
  const field = 'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15'

  if (createMode) {
    return (
      <form onSubmit={(event) => void openCase(event)} className="mx-auto max-w-[680px] rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
        <h1 className="font-display text-[30px] font-bold text-slate-900">{t('support.formTitle')}</h1>
        <fieldset className="mt-3">
          <legend className="text-sm font-bold text-slate-900">{t('support.categoryLabel')}</legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {categories.map((category, index) => (
              <label key={category} className="cursor-pointer">
                <input type="radio" name="category" value={category} defaultChecked={index === 0} className="peer sr-only" />
                <span className="inline-flex h-9 items-center rounded-full border border-slate-300 bg-white px-4 text-[15px] text-slate-800 transition hover:border-slate-400 peer-checked:border-[#164E63] peer-checked:bg-[#164E63] peer-checked:font-bold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">{t(categoryKeys[category])}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {linkContext && (
          <div className="mt-7 rounded-xl bg-[#F1F5F9] px-5 py-4">
            <p className="text-xs font-bold text-slate-500">{t('support.attached')}</p>
            <p className="mt-2 flex items-center gap-3 text-[15px] font-bold text-slate-900"><TicketIcon className="size-5 shrink-0 text-brand-500" />{t('support.relatedNote', { items: contextItems })}</p>
          </div>
        )}
        {!linkContext && user && <div className="mt-7"><ContextFields organizer={user.role === 'Organizer'} /></div>}

        <label className="mt-6 block text-sm font-bold text-slate-900">{t('support.subject')}<input name="subject" required maxLength={200} className={`${field} h-11`} /></label>
        <label className="mt-5 block text-sm font-bold text-slate-900">{t('support.message')}<textarea name="message" required maxLength={4000} rows={6} className={`${field} py-3`} /></label>
        <p className="mt-4 text-[13px] text-slate-600">{t('support.replyNote')}</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button disabled={busy} className="h-12 rounded-lg bg-brand-500 px-8 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('forgot.submitting') : t('support.submit')}</button>
          <button type="button" onClick={() => setCreateMode(false)} className="h-12 rounded-lg border border-slate-300 bg-white px-8 text-[15px] font-bold text-slate-900 hover:bg-slate-50">{t('common.cancel')}</button>
        </div>
      </form>
    )
  }

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[34px] font-bold tracking-tight text-slate-900">{t('support.title')}</h1>
        <div className="flex gap-3">
          <button onClick={() => void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : t('support.inboxRefreshError')))} className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 hover:bg-slate-50">{t('support.refresh')}</button>
          {canOpenCase && <button onClick={() => { setSelected(null); setCreateMode(true) }} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-6 text-sm font-bold text-white hover:bg-brand-600"><PlusIcon className="size-4" />{t('support.new')}</button>}
        </div>
      </header>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      {unreadNotifications.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#C9D4EE] bg-[#EEF3FE] p-4">
          <h2 className="text-sm font-bold text-slate-900">{t('support.newNotifications')}</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {unreadNotifications.map((item) => (
              <button key={item.id} onClick={() => void readNotification(item)} className="rounded-xl bg-white p-3 text-left hover:bg-slate-50">
                <span className="block text-sm font-bold text-slate-900">{item.title}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">{item.message}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-2 lg:min-h-[640px]" aria-label={t('support.conversations')}>
          <h2 className="px-4 pb-2 pt-4 font-display text-[22px] font-bold text-slate-900">{t('support.cases')} <span className="text-sm font-medium text-slate-400">({cases.length})</span></h2>
          {cases.length === 0 ? <p className="m-2 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">{canOpenCase ? t('support.empty') : t('support.emptyStaff')}</p> : (
            <ul className="space-y-1">
              {cases.map((item) => (
                <li key={item.id}>
                  <button onClick={() => selectCase(item)} className={`w-full rounded-xl px-4 py-3 text-left transition ${activeCase?.id === item.id ? 'bg-[#DCE6FD]' : 'hover:bg-slate-50'}`}>
                    <span className="block font-bold text-slate-900">{item.subject}</span>
                    <span className="mt-0.5 block text-sm text-slate-600">{categoryLabel(item.category)} · {formatDateTime(item.updatedAt)}</span>
                    <span className="mt-2 inline-block"><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-h-[640px] flex-col rounded-2xl border border-slate-200 bg-white">
          {!activeCase ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <ChatIcon className="mx-auto size-10 text-brand-500" />
                <h2 className="mt-4 font-display text-lg font-bold text-slate-900">{t('support.placeholderTitle')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('support.placeholderText')}</p>
              </div>
            </div>
          ) : (
            <>
              <header className="px-7 pt-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[22px] font-bold text-slate-900">{activeCase.subject}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(activeCase.status)}>{statusLabel(activeCase.status)}</Badge>
                      <span className="text-xs text-slate-500">{categoryLabel(activeCase.category)} · {t('support.updated', { time: formatDateTime(activeCase.updatedAt) })}</span>
                      {activeCase.isEscalated && <Badge tone="rose">{t('support.escalated')}</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!activeCase.isEscalated && activeCase.type === 'Attendee' && activeCase.status !== 'Resolved' && user?.role !== 'PlatformAdmin' && <button onClick={() => void escalate()} className="h-9 rounded-lg border border-[#FBBF24] px-3 text-xs font-bold text-[#92400E] hover:bg-[#FEF3C7]">{t('support.escalate')}</button>}
                    {isStaff && <select aria-label={t('support.statusLabel')} value={activeCase.status} onChange={(event) => void changeStatus(event.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">{Object.entries(statusKeys).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>}
                  </div>
                </div>
                {(activeCase.eventId || activeCase.orderId || activeCase.ticketId) && (
                  <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#F1F5F9] px-5 py-4">
                    <TicketIcon className="mt-0.5 size-5 shrink-0 text-brand-500" />
                    <div className="text-sm">
                      <p className="font-bold text-slate-900">
                        {activeCase.orderId && <>{t('orders.order')} <span className="font-mono">{activeCase.orderId.slice(0, 8).toUpperCase()}</span></>}
                        {activeCase.orderId && activeCase.eventId && ', '}
                        {activeCase.eventId && <Link to={`/events/${activeCase.eventId}`} className="text-brand-500 hover:text-brand-700">{t('support.event')}</Link>}
                      </p>
                      {activeCase.ticketId && <p className="mt-0.5 text-slate-600">{t('support.ticket')} <span className="font-mono">{activeCase.ticketId.slice(0, 8).toUpperCase()}</span></p>}
                    </div>
                  </div>
                )}
              </header>
              <div className="max-h-[520px] flex-1 space-y-4 overflow-y-auto px-7 py-6">
                {activeCase.messages.map((message) => {
                  const ownMessage = message.senderUserId === user?.id
                  return (
                    <div key={message.id} className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-4 py-3 sm:max-w-[440px] ${ownMessage ? 'bg-[#DCE6FD]' : 'bg-[#F1F5F9]'}`}>
                        <p className={`text-xs font-bold ${ownMessage ? 'text-[#2B4BB5]' : 'text-slate-600'}`}>{ownMessage ? t('support.you') : roleKeys[message.senderRole] ? t(roleKeys[message.senderRole]) : message.senderRole} · {formatDateTime(message.createdAt)}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-slate-900">{message.body}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {activeCase.status !== 'Resolved' ? (
                <form onSubmit={(event) => void sendReply(event)} className="px-7 pb-7">
                  <div className="rounded-xl border border-slate-300 p-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
                    <textarea aria-label={t('support.replyPlaceholder')} required maxLength={4000} rows={2} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t('support.replyPlaceholder')} className="block w-full resize-y bg-transparent px-1 text-[15px] outline-none placeholder:text-slate-500" />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <Link to="/orders" className="text-xs font-bold text-brand-500">{t('support.viewTickets')}</Link>
                      <button disabled={busy || !reply.trim()} className="h-10 rounded-lg bg-brand-500 px-8 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('forgot.submitting') : t('support.sendReply')}</button>
                    </div>
                  </div>
                </form>
              ) : <p className="border-t border-slate-100 px-7 py-5 text-sm text-slate-500">{t('support.resolved')}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Lets the requester attach the event (and order) the question is about. The API sends an attendee case
 * with an event to that event's organizer; without one it goes to platform support (SRS 4.13).
 */
function ContextFields({ organizer }: { organizer: boolean }) {
  const { t } = useLocale()
  const [events, setEvents] = useState<{ id: string; title: string }[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [eventId, setEventId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    // Attendees pick from events they hold orders for; organizers from their own events.
    const load = organizer
      ? getEvents(true).then((rows) => ({ events: rows.map((row) => ({ id: row.id, title: row.title })), orders: [] as Order[] }))
      : getMyOrders().then((rows) => ({
        events: [...new Map(rows.map((row) => [row.eventId, { id: row.eventId, title: row.eventTitle }])).values()],
        orders: rows,
      }))
    load
      .then((value) => { if (!active) return; setEvents(value.events); setOrders(value.orders) })
      .catch((err: unknown) => { if (active) { setEvents([]); setError(err instanceof Error ? err.message : t('support.contextError')) } })
    return () => { active = false }
  }, [organizer, t])

  const eventOrders = orders.filter((order) => order.eventId === eventId)
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">{t('support.eventLabel')}
        <select name="eventId" value={eventId} onChange={(event) => setEventId(event.target.value)} disabled={!events} className={`${inputClass} mt-1.5`}>
          <option value="">{t('support.eventNone')}</option>
          {events?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <span className="mt-1.5 block text-xs font-normal text-slate-500">{organizer ? t('support.organizerEventHint') : t('support.eventHint')}</span>
      </label>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {eventOrders.length > 0 && (
        <label className="block text-sm font-medium">{t('support.orderLabel')}
          <select key={eventId} name="orderId" defaultValue="" className={`${inputClass} mt-1.5`}>
            <option value="">{t('support.orderNone')}</option>
            {eventOrders.map((order) => <option key={order.id} value={order.id}>{t('support.orderOption', { id: order.id.slice(0, 8), date: formatDate(order.createdAt) })}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
