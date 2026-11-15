import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { duplicateEvent } from '../api/events'
import { getOrganizerDashboard, type OrganizerDashboard as Dashboard } from '../api/platform'
import { inputClass } from '../components/form'
import { dayBoundary, formatDateTime, formatKzt, formatNumber } from '../lib/format'
import { Stat } from './manage/AnalyticsTab'

const lifecycles = ['Upcoming', 'Active', 'Completed', 'Cancelled'] as const
type Lifecycle = typeof lifecycles[number]

const badge: Record<Lifecycle, string> = {
  Upcoming: 'bg-indigo-50 text-indigo-700',
  Active: 'bg-emerald-50 text-emerald-700',
  Completed: 'bg-slate-100 text-slate-600',
  Cancelled: 'bg-rose-50 text-rose-700',
}

/** Organizer overview with Upcoming / Active / Completed / Cancelled views (SRS 4.15, 4.16). */
export default function OrganizerDashboard() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [filter, setFilter] = useState<Lifecycle | 'All'>('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    getOrganizerDashboard({ from: dayBoundary(from), to: dayBoundary(to, true) })
      .then((value) => { if (active) setData(value) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load the dashboard.') })
    return () => { active = false }
  }, [from, to])

  async function duplicate(eventId: string) {
    setError('')
    setMessage('')
    try {
      const copy = await duplicateEvent(eventId)
      setMessage(`Draft copy "${copy.title}" created without the original orders, tickets or check-ins.`)
      setData(await getOrganizerDashboard({ from: dayBoundary(from), to: dayBoundary(to, true) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate this event.')
    }
  }

  if (error && !data) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p>
  if (!data) return <p className="text-slate-500">Loading dashboard…</p>
  const events = data.events.filter((event) => filter === 'All' || event.lifecycleStatus === filter)
  const counts: Record<Lifecycle, number> = { Upcoming: data.upcoming, Active: data.active, Completed: data.completed, Cancelled: data.cancelled }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-indigo-600">Organizer workspace</p><h1 className="mt-1 text-3xl font-black tracking-tight">Dashboard</h1><p className="mt-2 text-sm text-slate-500">Sales, revenue and attendance across the events you manage.{data.isDemonstration && ' Money figures are demonstration data.'}</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
          <label className="text-sm font-medium">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        </div>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Events" value={formatNumber(data.eventCount)} hint={`${data.upcoming} upcoming · ${data.active} active`} />
        <Stat label="Tickets sold" value={formatNumber(data.ticketsSold)} />
        <Stat label="Net revenue" value={formatKzt(data.netRevenue)} hint={`Gross ${formatKzt(data.grossSales)}`} />
        <Stat label="Estimated payout" value={formatKzt(data.estimatedPayout)} hint="Simulation — nothing is paid out" />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" role="tablist" aria-label="Event status">
          {(['All', ...lifecycles] as const).map((item) => (
            <button key={item} role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${filter === item ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {item}{item !== 'All' && <span className="ml-1.5 opacity-70">{counts[item]}</span>}
            </button>
          ))}
        </div>
        {events.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No events in this view.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">Event</th><th className="p-3">Status</th><th className="p-3">Sold / capacity</th><th className="p-3">Checked in</th><th className="p-3">Net revenue</th><th className="p-3">Actions</th></tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.eventId} className="border-t border-slate-100">
                  <td className="p-3"><Link to={`/events/${event.eventId}/manage`} className="font-bold text-slate-900 hover:underline">{event.title}</Link><span className="block text-xs text-slate-500">{formatDateTime(event.startDateUtc)}{event.isPublished ? '' : ' · Draft'}</span></td>
                  <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge[event.lifecycleStatus]}`}>{event.lifecycleStatus}</span></td>
                  <td className="p-3">{event.ticketsSold} / {event.totalCapacity}</td>
                  <td className="p-3">{event.checkedIn}</td>
                  <td className="p-3 font-semibold">{formatKzt(event.netRevenue)}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <Link to={`/events/${event.eventId}/manage?tab=analytics`} className="text-indigo-700 hover:underline">Analytics</Link>
                    <Link to={`/events/${event.eventId}/manage?tab=history`} className="text-indigo-700 hover:underline">History</Link>
                    <button onClick={() => void duplicate(event.eventId)} className="text-indigo-700 hover:underline">Duplicate as draft</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
