import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { markAllNotificationsRead } from '../api/platform'
import { getNotifications, markNotificationRead } from '../api/workflows'
import { formatDateTime, humanize } from '../lib/format'

type Notification = Awaited<ReturnType<typeof getNotifications>>[number]

/** Where a notification leads: its support case, the order list, or the event page. */
function target(item: Notification): string | null {
  if (item.relatedCaseId) return `/support?caseId=${item.relatedCaseId}`
  if (item.relatedOrderId) return '/orders'
  if (item.relatedEventId) return `/events/${item.relatedEventId}`
  return null
}

/** In-app notification centre (SRS 4.10); the same events are also sent by email. */
export default function Notifications() {
  const [items, setItems] = useState<Notification[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getNotifications().then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load notifications.'))
  }, [])

  async function read(item: Notification) {
    if (item.readAt) return
    try {
      await markNotificationRead(item.id)
      setItems((current) => current?.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark the notification as read.')
    }
  }

  async function readAll() {
    try {
      await markAllNotificationsRead()
      setItems(await getNotifications())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark notifications as read.')
    }
  }

  if (!items) return error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p> : <p className="text-slate-500">Loading notifications…</p>
  const unread = items.filter((item) => !item.readAt).length
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-semibold text-indigo-600">Stay in the loop</p><h1 className="mt-1 text-3xl font-black tracking-tight">Notifications</h1><p className="mt-2 text-sm text-slate-500">{unread} unread</p></div>
        {unread > 0 && <button onClick={() => void readAll()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Mark all as read</button>}
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {items.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Nothing here yet. Order confirmations, event updates and support replies will appear here.</p> : (
        <ul className="space-y-3">
          {items.map((item) => {
            const link = target(item)
            return (
              <li key={item.id} className={`rounded-2xl border p-4 shadow-sm ${item.readAt ? 'border-slate-200 bg-white' : 'border-indigo-200 bg-indigo-50/60'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{humanize(item.type)}</p><h2 className="mt-1 font-bold">{item.title}</h2></div>
                  <time dateTime={item.createdAt} className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{item.message}</p>
                <div className="mt-3 flex gap-4 text-sm font-semibold">
                  {link && <Link to={link} onClick={() => void read(item)} className="text-indigo-700 hover:underline">Open</Link>}
                  {!item.readAt && <button onClick={() => void read(item)} className="text-slate-500 hover:underline">Mark as read</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
