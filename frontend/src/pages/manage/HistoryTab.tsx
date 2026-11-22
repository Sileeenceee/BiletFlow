import { useEffect, useState } from 'react'
import { getActivityTypes, getEventHistory, type HistoryEntry } from '../../api/platform'
import { inputClass } from '../../components/form'
import { dayBoundary, formatDateTime, humanize } from '../../lib/format'
import { isMessageKey, useLocale } from '../../lib/i18n'

/** Read-only activity timeline (SRS 4.16): audit entries cannot be edited or deleted here. */
export function HistoryTab({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [types, setTypes] = useState<string[]>([])
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const { t } = useLocale()
  const activityLabel = (type: string) => {
    const key = `activity.${type}`
    return isMessageKey(key) ? t(key) : humanize(type)
  }

  useEffect(() => {
    getActivityTypes().then(setTypes).catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    getEventHistory(eventId, { from: dayBoundary(from), to: dayBoundary(to, true), type: type || undefined })
      .then((value) => { if (active) setEntries(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('history.loadError')) })
    return () => { active = false }
  }, [eventId, from, onError, t, to, type])

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto"><h2 className="text-xl font-bold">{t('history.title')}</h2><p className="mt-1 text-sm text-slate-500">{t('history.text')}</p></div>
        <label className="text-sm font-medium">{t('analytics.from')}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">{t('analytics.to')}<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">{t('history.activity')}<select value={type} onChange={(event) => setType(event.target.value)} className={`${inputClass} mt-1.5`}><option value="">{t('history.allActivity')}</option>{types.map((item) => <option key={item} value={item}>{activityLabel(item)}</option>)}</select></label>
      </div>
      {!entries ? <p className="py-6 text-center text-sm text-slate-500">{t('history.loading')}</p> : entries.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">{t('history.empty')}</p> : (
        <ol className="space-y-0 border-l-2 border-slate-100 pl-5">
          {entries.map((entry) => (
            <li key={entry.id} className="relative pb-5">
              <span aria-hidden="true" className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-white bg-indigo-500" />
              <p className="text-xs text-slate-500"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actorEmail ?? t('history.system')}</p>
              <p className="mt-1 text-sm"><span className="mr-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{activityLabel(entry.actionType)}</span>{entry.description}</p>
              <p className="mt-1 text-xs text-slate-400">{entry.entityType}{entry.entityId ? ` ${entry.entityId.slice(0, 8)}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
