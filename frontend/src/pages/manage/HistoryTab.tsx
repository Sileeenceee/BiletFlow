import { useEffect, useState } from 'react'
import { getActivityTypes, getEventHistory, type HistoryEntry } from '../../api/platform'
import { inputClass } from '../../components/form'
import { dayBoundary, formatDateTime, humanize } from '../../lib/format'

/** Read-only activity timeline (SRS 4.16): audit entries cannot be edited or deleted here. */
export function HistoryTab({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [types, setTypes] = useState<string[]>([])
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)

  useEffect(() => {
    getActivityTypes().then(setTypes).catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    getEventHistory(eventId, { from: dayBoundary(from), to: dayBoundary(to, true), type: type || undefined })
      .then((value) => { if (active) setEntries(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load the activity timeline.') })
    return () => { active = false }
  }, [eventId, from, onError, to, type])

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto"><h2 className="text-xl font-bold">Activity timeline</h2><p className="mt-1 text-sm text-slate-500">Who did what for this event, newest first. Entries are kept for audit and cannot be changed.</p></div>
        <label className="text-sm font-medium">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">Activity<select value={type} onChange={(event) => setType(event.target.value)} className={`${inputClass} mt-1.5`}><option value="">All activity</option>{types.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label>
      </div>
      {!entries ? <p className="py-6 text-center text-sm text-slate-500">Loading history…</p> : entries.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No activity matches these filters.</p> : (
        <ol className="space-y-0 border-l-2 border-slate-100 pl-5">
          {entries.map((entry) => (
            <li key={entry.id} className="relative pb-5">
              <span aria-hidden="true" className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-white bg-indigo-500" />
              <p className="text-xs text-slate-500"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actorEmail ?? 'System'}</p>
              <p className="mt-1 text-sm"><span className="mr-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{humanize(entry.actionType)}</span>{entry.description}</p>
              <p className="mt-1 text-xs text-slate-400">{entry.entityType}{entry.entityId ? ` ${entry.entityId.slice(0, 8)}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
