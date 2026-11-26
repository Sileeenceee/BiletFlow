import { useEffect, useState } from 'react'
import { getActivityTypes, getEventHistory, type HistoryEntry } from '../../api/platform'
import { Badge } from '../../components/EventCard'
import { dayBoundary, formatDateTime, humanize } from '../../lib/format'
import { isMessageKey, useLocale } from '../../lib/i18n'
import { card, Empty } from './ui'

// Badge colour by kind of activity, matched on the action type's name.
function tone(type: string): 'green' | 'amber' | 'rose' | 'cyan' | 'slate' {
  if (/Reversed|Reversal|Undo/i.test(type)) return 'amber'
  if (/Refund|Cancel|Suspend|Failed|Expired/i.test(type)) return 'rose'
  if (/Publish|Succeeded|Confirmed|Activated|Reinstat/i.test(type)) return 'green'
  if (/CheckIn|Promo|Campaign/i.test(type)) return 'cyan'
  return 'slate'
}

/** Read-only activity timeline (SRS 4.16, design 4.15): audit entries cannot be edited or deleted here. */
export function HistoryTab({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [types, setTypes] = useState<string[]>([])
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const { t } = useLocale()
  const activityLabel = (value: string) => {
    const key = `activity.${value}`
    return isMessageKey(key) ? t(key) : humanize(value)
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

  const control = 'h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900'
  return (
    <section>
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto"><h2 className="font-display text-[26px] font-bold text-slate-900">{t('history.title')}</h2><p className="mt-1 text-[15px] text-slate-600">{t('history.text')}</p></div>
        <input type="date" aria-label={t('analytics.from')} title={t('analytics.from')} value={from} onChange={(event) => setFrom(event.target.value)} className={control} />
        <input type="date" aria-label={t('analytics.to')} title={t('analytics.to')} value={to} onChange={(event) => setTo(event.target.value)} className={control} />
        <select aria-label={t('history.activity')} value={type} onChange={(event) => setType(event.target.value)} className={control}><option value="">{t('history.allActivity')}</option>{types.map((item) => <option key={item} value={item}>{activityLabel(item)}</option>)}</select>
      </div>
      {!entries ? <p className="mt-6 text-sm text-slate-500">{t('history.loading')}</p> : entries.length === 0 ? <div className="mt-6"><Empty>{t('history.empty')}</Empty></div> : (
        <ol className="relative mt-6 space-y-3 before:absolute before:bottom-4 before:left-[11px] before:top-4 before:w-0.5 before:bg-[#DCE5F7]">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative pl-10">
              <span aria-hidden="true" className={`absolute left-[5px] top-6 rounded-full bg-brand-500 ${index === entries.length - 1 ? 'size-[18px] -translate-x-[3px]' : 'size-3'}`} />
              <div className={`${card} px-5 py-4`}>
                <div className="flex flex-wrap items-center gap-3">
                  <time dateTime={entry.createdAt} className="text-[13px] font-bold text-slate-600">{formatDateTime(entry.createdAt)}</time>
                  <Badge tone={tone(entry.actionType)}>{activityLabel(entry.actionType)}</Badge>
                </div>
                <p className="mt-1.5 font-bold text-slate-900">{entry.description}</p>
                <p className="mt-0.5 text-sm text-slate-600">{entry.actorEmail ?? t('history.system')}{entry.entityType ? ` · ${entry.entityType}${entry.entityId ? ` ${entry.entityId.slice(0, 8).toUpperCase()}` : ''}` : ''}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
