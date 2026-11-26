import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { duplicateEvent } from '../api/events'
import { getEventAnalytics, getOrganizerDashboard, type EventAnalytics, type OrganizerDashboard } from '../api/platform'
import { getSupportCases, type SupportCase } from '../api/workflows'
import { Badge } from '../components/EventCard'
import { formatDate, formatNumber } from '../lib/format'
import { useLocale } from '../lib/i18n'
import { HistoryTab } from './manage/HistoryTab'
import { card, Empty } from './manage/ui'

type PastEvent = OrganizerDashboard['events'][number]

/** Completed and cancelled events with their numbers and activity timeline (design 4.15). */
export default function OrganizerHistory() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [events, setEvents] = useState<PastEvent[] | null>(null)
  const [cases, setCases] = useState<SupportCase[]>([])
  const [tab, setTab] = useState<'Completed' | 'Cancelled'>('Completed')
  const [selectedId, setSelectedId] = useState('')
  const [stats, setStats] = useState<EventAnalytics | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getOrganizerDashboard()
      .then((data) => { if (active) setEvents(data.events.filter((event) => event.lifecycleStatus === 'Completed' || event.lifecycleStatus === 'Cancelled')) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('dashboard.loadError')) })
    getSupportCases().then((rows) => { if (active) setCases(rows) }).catch(() => undefined)
    return () => { active = false }
  }, [t])

  const shown = (events ?? []).filter((event) => event.lifecycleStatus === tab).sort((a, b) => b.startDateUtc.localeCompare(a.startDateUtc))
  const selected = shown.find((event) => event.eventId === selectedId) ?? shown[0] ?? null

  useEffect(() => {
    if (!selected) return
    let active = true
    getEventAnalytics(selected.eventId, {}).then((value) => { if (active) setStats(value) }).catch(() => { if (active) setStats(null) })
    return () => { active = false }
  }, [selected])

  async function duplicate() {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const copy = await duplicateEvent(selected.eventId)
      void navigate(`/events/${copy.id}/manage`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('events.duplicateError'))
      setBusy(false)
    }
  }

  const numbers = selected && stats?.eventId === selected.eventId ? [
    [t('analytics.tickets'), stats.capacity.ticketsSold],
    [t('account.orders'), stats.revenue.confirmedOrders],
    [t('analytics.refunds'), stats.revenue.refundedOrders],
    [t('history.checkIns'), stats.attendance.checkedIn],
    [t('history.promoCodes'), stats.campaigns.length],
    [t('history.supportCases'), cases.filter((item) => item.eventId === selected.eventId).length],
  ] as [string, number][] : null

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="font-display text-[34px] font-bold tracking-tight text-slate-900">{t('history.pageTitle')}</h1>
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#FEE2E2] p-3 text-sm text-[#B91C1C]">{error}</p>}
      {!events ? <p className="mt-6 text-slate-500">{t('dashboard.loading')}</p> : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={`${card} p-3`}>
            <div role="tablist" className="flex gap-6 border-b border-slate-200 px-2">
              {(['Completed', 'Cancelled'] as const).map((item) => (
                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setSelectedId('') }} className={`-mb-px border-b-2 pb-3 pt-2 text-[15px] transition ${tab === item ? 'border-brand-500 font-bold text-brand-500' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{t(`dashboard.lifecycle.${item}`)}</button>
              ))}
            </div>
            {shown.length === 0 ? <p className="p-4 text-sm text-slate-500">{t('dashboard.empty')}</p> : (
              <ul className="mt-2 space-y-1">
                {shown.map((event) => (
                  <li key={event.eventId}>
                    <button type="button" onClick={() => setSelectedId(event.eventId)} className={`w-full rounded-xl px-4 py-3 text-left transition ${selected?.eventId === event.eventId ? 'bg-[#EEF3FE]' : 'hover:bg-slate-50'}`}>
                      <span className="block font-bold text-slate-900">{event.title}</span>
                      <span className="block text-sm text-slate-600">{t('history.eventLine', { date: formatDate(event.startDateUtc), count: formatNumber(event.ticketsSold) })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className="min-w-0 space-y-8">
            {!selected ? <Empty>{t('history.pickEvent')}</Empty> : (
              <>
                <section className={`${card} p-6`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-[26px] font-bold text-slate-900">{selected.title}</h2>
                    <Badge tone={selected.lifecycleStatus === 'Cancelled' ? 'rose' : 'slate'}>{t(`dashboard.lifecycle.${selected.lifecycleStatus}`)}</Badge>
                  </div>
                  {numbers ? (
                    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {numbers.map(([label, value]) => <div key={label} className="rounded-xl bg-[#F1F5F9] px-4 py-3"><dt className="text-[13px] text-slate-600">{label}</dt><dd className="font-display text-2xl font-bold text-slate-900">{formatNumber(value)}</dd></div>)}
                    </dl>
                  ) : <p className="mt-4 text-sm text-slate-500">{t('analytics.loading')}</p>}
                  <button type="button" disabled={busy} onClick={() => void duplicate()} className="mt-6 h-12 rounded-lg bg-brand-500 px-8 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{t('manage.duplicateDraft')}</button>
                </section>
                <HistoryTab key={selected.eventId} eventId={selected.eventId} onError={setError} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
