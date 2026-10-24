import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { addSupportMessage, createSupportCase, getNotifications, getSupportCases, markNotificationRead, updateSupportCase, type SupportCase } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { useAuth } from '../lib/auth'
import { formatDateTime } from '../lib/format'

const attendeeCategories = ['Ticket delivery', 'Payment', 'Refund', 'Seating', 'Event information', 'Check-in', 'Account', 'Technical problem']
const organizerCategories = ['Account', 'Activation', 'Payment', 'Technical problem']

type Notification = Awaited<ReturnType<typeof getNotifications>>[number]

export default function Support() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cases, setCases] = useState<SupportCase[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [selected, setSelected] = useState<SupportCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createMode, setCreateMode] = useState(false)
  const [reply, setReply] = useState('')
  const isStaff = user?.role === 'PlatformAdmin' || user?.role === 'Organizer'
  const canOpenCase = user?.role === 'Attendee' || user?.role === 'Organizer'
  const categories = user?.role === 'Organizer' ? organizerCategories : attendeeCategories

  const refresh = useCallback(async () => {
    const [caseRows, notificationRows] = await Promise.all([getSupportCases(), getNotifications()])
    setCases(caseRows)
    setNotifications(notificationRows)
    if (selected) setSelected(caseRows.find((row) => row.id === selected.id) ?? null)
  }, [selected])

  useEffect(() => {
    let active = true
    Promise.all([getSupportCases(), getNotifications()])
      .then(([caseRows, notificationRows]) => {
        if (!active) return
        setCases(caseRows)
        setNotifications(notificationRows)
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load support messages.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not refresh support messages.')
      })
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

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
    setError('')
    setBusy(true)
    try {
      const created = await createSupportCase({
        category: String(data.get('category')),
        subject: String(data.get('subject')).trim(),
        message: String(data.get('message')).trim(),
        eventId: searchParams.get('eventId') ?? undefined,
        orderId: searchParams.get('orderId') ?? undefined,
        ticketId: searchParams.get('ticketId') ?? undefined,
      })
      await refresh()
      setSelected(created)
      setCreateMode(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this support case.')
    } finally {
      setBusy(false)
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeCase) return
    setError('')
    setBusy(true)
    try {
      const updated = await addSupportMessage(activeCase.id, reply.trim())
      setSelected(updated)
      setReply('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your reply.')
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
      setError(err instanceof Error ? err.message : 'Could not update the case status.')
    }
  }

  async function readNotification(item: Notification) {
    setError('')
    try {
      if (!item.readAt) await markNotificationRead(item.id)
      if (item.relatedCaseId) selectCase(cases.find((supportCase) => supportCase.id === item.relatedCaseId) ?? null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark notification as read.')
    }
  }

  if (loading) return <p className="text-slate-500">Loading support inbox…</p>
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-indigo-600">BiletFlow care</p><h1 className="mt-1 text-3xl font-black tracking-tight">Support inbox</h1><p className="mt-2 text-sm text-slate-500">Send a message and continue the conversation when your support team replies.</p></div>
        <div className="flex gap-2"><button onClick={() => void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not refresh the inbox.'))} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Refresh</button>{canOpenCase && <button onClick={() => { setSelected(null); setCreateMode(true) }} className={buttonClass}>New support request</button>}</div>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {notifications.some((item) => !item.readAt) && <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
        <h2 className="font-bold text-indigo-950">New notifications</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{notifications.filter((item) => !item.readAt).map((item) => <button key={item.id} onClick={() => void readNotification(item)} className="rounded-xl bg-white p-3 text-left shadow-sm"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.message}</span></button>)}</div>
      </section>}
      {createMode ? (
        <form onSubmit={(event) => void openCase(event)} className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div><h2 className="text-xl font-bold">Open a support request</h2><p className="mt-1 text-sm text-slate-500">Include a clear subject and details so the team can help.</p></div>
          <label className="block text-sm font-medium">Category<select name="category" required className={`${inputClass} mt-1.5`}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="block text-sm font-medium">Subject<input name="subject" required maxLength={200} className={`${inputClass} mt-1.5`} /></label>
          <label className="block text-sm font-medium">Message<textarea name="message" required maxLength={4000} rows={6} className={`${inputClass} mt-1.5`} /></label>
          {(searchParams.get('orderId') || searchParams.get('eventId')) && <p className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-800">This request will include the related {searchParams.get('orderId') ? 'order' : 'event'} reference.</p>}
          <div className="flex gap-3"><button disabled={busy} className={buttonClass}>{busy ? 'Sending…' : 'Submit request'}</button><button type="button" onClick={() => setCreateMode(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button></div>
        </form>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Conversations <span className="ml-1 text-sm font-medium text-slate-400">({cases.length})</span></h2>
            {cases.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{canOpenCase ? 'No support requests yet.' : 'There are no cases available for this account.'}</p> : cases.map((item) => (
              <button key={item.id} onClick={() => selectCase(item)} className={`w-full rounded-2xl border p-4 text-left transition ${activeCase?.id === item.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-bold">{item.subject}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{item.status}</span></div>
                <p className="mt-1 text-xs text-slate-500">{item.category} · {formatDateTime(item.updatedAt)}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{item.messages.at(-1)?.body}</p>
              </button>
            ))}
          </section>
          <section className="min-h-96 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {!activeCase ? <div className="grid min-h-96 place-items-center p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-xl">✉</div><h2 className="mt-4 font-bold">Your conversations, together</h2><p className="mt-1 text-sm text-slate-500">Select a request to view its messages and reply.</p></div></div> : (
              <>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{activeCase.category}</p><h2 className="mt-1 text-xl font-bold">{activeCase.subject}</h2><p className="mt-1 text-xs text-slate-500">Updated {formatDateTime(activeCase.updatedAt)}</p></div>{isStaff && <select aria-label="Case status" value={activeCase.status} onChange={(event) => void changeStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="Open">Open</option><option value="In Progress">In progress</option><option value="Waiting for Customer">Waiting for customer</option><option value="Resolved">Resolved</option></select>}</header>
                <div className="max-h-[500px] space-y-4 overflow-y-auto p-5">
                  {activeCase.messages.map((message) => {
                    const ownMessage = message.senderUserId === user?.id
                    return <div key={message.id} className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${ownMessage ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}><p className="mb-1 text-[10px] font-bold uppercase opacity-70">{ownMessage ? 'You' : message.senderRole} · {formatDateTime(message.createdAt)}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p></div></div>
                  })}
                </div>
                {activeCase.status !== 'Resolved' ? <form onSubmit={(event) => void sendReply(event)} className="border-t border-slate-100 p-4"><textarea required maxLength={4000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply…" className={`${inputClass} resize-y`} /><div className="mt-3 flex items-center justify-between"><Link to="/orders" className="text-xs font-semibold text-indigo-700">View my tickets</Link><button disabled={busy || !reply.trim()} className={buttonClass}>{busy ? 'Sending…' : 'Send reply'}</button></div></form> : <p className="border-t border-slate-100 p-4 text-sm text-slate-500">This request is resolved and can no longer receive replies.</p>}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
