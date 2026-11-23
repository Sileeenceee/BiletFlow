import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { addSupportMessage, createSupportCase, getNotifications, getSupportCases, markNotificationRead, updateSupportCase, type SupportCase } from '../api/workflows'
import { escalateSupportCase } from '../api/platform'
import { buttonClass, inputClass } from '../components/form'
import { useAuth } from '../lib/auth'
import { formatDateTime } from '../lib/format'
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
        eventId: searchParams.get('eventId') ?? undefined,
        orderId: searchParams.get('orderId') ?? undefined,
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
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-indigo-600">{t('support.kicker')}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{t('support.title')}</h1><p className="mt-2 text-sm text-slate-500">{t('support.subtitle')}</p></div>
        <div className="flex gap-2"><button onClick={() => void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : t('support.inboxRefreshError')))} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">{t('support.refresh')}</button>{canOpenCase && <button onClick={() => { setSelected(null); setCreateMode(true) }} className={buttonClass}>{t('support.new')}</button>}</div>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {notifications.some((item) => !item.readAt) && <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
        <h2 className="font-bold text-indigo-950">{t('support.newNotifications')}</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{notifications.filter((item) => !item.readAt).map((item) => <button key={item.id} onClick={() => void readNotification(item)} className="rounded-xl bg-white p-3 text-left shadow-sm"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.message}</span></button>)}</div>
      </section>}
      {createMode ? (
        <form onSubmit={(event) => void openCase(event)} className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div><h2 className="text-xl font-bold">{t('support.formTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('support.formText')}</p></div>
          <label className="block text-sm font-medium">{t('support.categoryLabel')}<select name="category" required className={`${inputClass} mt-1.5`}>{categories.map((category) => <option key={category} value={category}>{t(categoryKeys[category])}</option>)}</select></label>
          <label className="block text-sm font-medium">{t('support.subject')}<input name="subject" required maxLength={200} className={`${inputClass} mt-1.5`} /></label>
          <label className="block text-sm font-medium">{t('support.message')}<textarea name="message" required maxLength={4000} rows={6} className={`${inputClass} mt-1.5`} /></label>
          {(searchParams.get('orderId') || searchParams.get('eventId') || searchParams.get('ticketId')) && <p className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-800">{t('support.relatedNote', { items: [searchParams.get('eventId') && t('support.relatedEvent'), searchParams.get('orderId') && t('support.relatedOrder'), searchParams.get('ticketId') && t('support.relatedTicket')].filter(Boolean).join(', ') })}</p>}
          <div className="flex gap-3"><button disabled={busy} className={buttonClass}>{busy ? t('forgot.submitting') : t('support.submit')}</button><button type="button" onClick={() => setCreateMode(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">{t('common.cancel')}</button></div>
        </form>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <section className="space-y-3">
            <h2 className="text-lg font-bold">{t('support.conversations')} <span className="ml-1 text-sm font-medium text-slate-400">({cases.length})</span></h2>
            {cases.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{canOpenCase ? t('support.empty') : t('support.emptyStaff')}</p> : cases.map((item) => (
              <button key={item.id} onClick={() => selectCase(item)} className={`w-full rounded-2xl border p-4 text-left transition ${activeCase?.id === item.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-bold">{item.subject}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{statusKeys[item.status] ? t(statusKeys[item.status]) : item.status}</span></div>
                <p className="mt-1 text-xs text-slate-500">{categoryKeys[item.category] ? t(categoryKeys[item.category]) : item.category} · {formatDateTime(item.updatedAt)}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{item.messages.at(-1)?.body}</p>
              </button>
            ))}
          </section>
          <section className="min-h-96 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {!activeCase ? <div className="grid min-h-96 place-items-center p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-xl">✉</div><h2 className="mt-4 font-bold">{t('support.placeholderTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('support.placeholderText')}</p></div></div> : (
              <>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{categoryKeys[activeCase.category] ? t(categoryKeys[activeCase.category]) : activeCase.category}</p><h2 className="mt-1 text-xl font-bold">{activeCase.subject}</h2><p className="mt-1 text-xs text-slate-500">{t('support.updated', { time: formatDateTime(activeCase.updatedAt) })}{activeCase.isEscalated ? ` · ${t('support.escalated')}` : ''}</p><p className="mt-2 flex flex-wrap gap-2 text-xs">{activeCase.eventId && <Link to={`/events/${activeCase.eventId}`} className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-200">{t('support.event')}</Link>}{activeCase.orderId && <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-slate-600">{t('orders.order')} {activeCase.orderId.slice(0, 8)}</span>}{activeCase.ticketId && <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-slate-600">{t('support.ticket')} {activeCase.ticketId.slice(0, 8)}</span>}{!activeCase.isEscalated && activeCase.type === 'Attendee' && activeCase.status !== 'Resolved' && user?.role !== 'PlatformAdmin' && <button onClick={() => void escalate()} className="rounded-full border border-amber-200 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-50">{t('support.escalate')}</button>}</p></div>{isStaff && <select aria-label={t('support.statusLabel')} value={activeCase.status} onChange={(event) => void changeStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">{Object.entries(statusKeys).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>}</header>
                <div className="max-h-[500px] space-y-4 overflow-y-auto p-5">
                  {activeCase.messages.map((message) => {
                    const ownMessage = message.senderUserId === user?.id
                    return <div key={message.id} className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${ownMessage ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}><p className="mb-1 text-[10px] font-bold uppercase opacity-70">{ownMessage ? t('support.you') : roleKeys[message.senderRole] ? t(roleKeys[message.senderRole]) : message.senderRole} · {formatDateTime(message.createdAt)}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p></div></div>
                  })}
                </div>
                {activeCase.status !== 'Resolved' ? <form onSubmit={(event) => void sendReply(event)} className="border-t border-slate-100 p-4"><textarea required maxLength={4000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t('support.replyPlaceholder')} className={`${inputClass} resize-y`} /><div className="mt-3 flex items-center justify-between"><Link to="/orders" className="text-xs font-semibold text-indigo-700">{t('support.viewTickets')}</Link><button disabled={busy || !reply.trim()} className={buttonClass}>{busy ? t('forgot.submitting') : t('support.sendReply')}</button></div></form> : <p className="border-t border-slate-100 p-4 text-sm text-slate-500">{t('support.resolved')}</p>}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
