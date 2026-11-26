import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { duplicateEvent, getTicketTypes, updateEvent, type EventSummary, type TicketType } from '../../api/events'
import { getEventAnalytics, getEventHistory, type EventAnalytics, type HistoryEntry } from '../../api/platform'
import { Badge } from '../../components/EventCard'
import { EyeIcon, ScanIcon, TicketIcon, UsersIcon } from '../../components/icons'
import { formatDate, formatDateTime, formatKzt, formatNumber, humanize } from '../../lib/format'
import { isMessageKey, useLocale } from '../../lib/i18n'
import { toEventInput } from '../setup/eventInput'
import { CancelEventModal } from './CancelEventModal'
import type { ManageTab } from './tabs'
import { card, sectionTitle, secondaryButton, StatCard, table, tableWrap, td, th, thead } from './ui'

/** Event overview (design 4.5): headline numbers, ticket inventory, quick actions, paid sales and recent activity. */
export function OverviewTab({ event, onUpdate, onOpenTab, onError, onMessage }: {
  event: EventSummary
  onUpdate: (event: EventSummary) => void
  onOpenTab: (tab: ManageTab) => void
  onError: (value: string) => void
  onMessage: (value: string) => void
}) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [types, setTypes] = useState<TicketType[]>([])
  const [analytics, setAnalytics] = useState<EventAnalytics | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    getTicketTypes(event.id).then((rows) => { if (active) setTypes(rows) }).catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.ticketsLoadError')) })
    getEventAnalytics(event.id, {}).then((value) => { if (active) setAnalytics(value) }).catch(() => undefined)
    getEventHistory(event.id, {}).then((rows) => { if (active) setHistory(rows.slice(0, 4)) }).catch(() => undefined)
    return () => { active = false }
  }, [event.id, onError, t])

  async function togglePublished() {
    onError('')
    onMessage('')
    setBusy(true)
    try {
      const saved = await updateEvent(event.id, toEventInput(event, { isPublished: !event.isPublished }))
      onUpdate(saved)
      onMessage(saved.isPublished ? t('manage.publishedMessage') : t('manage.unpublishedMessage'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function duplicate() {
    onError('')
    setBusy(true)
    try {
      const copy = await duplicateEvent(event.id)
      void navigate(`/events/${copy.id}/manage`)
    } catch (err) {
      onError(err instanceof Error ? err.message : t('events.duplicateError'))
      setBusy(false)
    }
  }

  const sold = types.reduce((sum, type) => sum + type.soldQuantity, 0)
  const capacity = event.capacity ?? types.reduce((sum, type) => sum + type.quantity, 0)
  const today = new Date(now).toISOString().slice(0, 10)
  const todaySales = analytics?.salesOverTime.find((point) => point.date.slice(0, 10) === today)?.ticketsSold ?? 0
  const daysToStart = Math.ceil((new Date(event.startDateUtc).getTime() - now) / 86_400_000)
  const activityLabel = (type: string) => { const key = `activity.${type}`; return isMessageKey(key) ? t(key) : humanize(type) }
  const paidStatus = event.paidSalesStatus ?? 'None'
  const paidTone = paidStatus === 'Active' ? 'green' : paidStatus === 'Suspended' ? 'rose' : paidStatus === 'Pending' ? 'amber' : 'slate'

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('analytics.ticketsSold')} value={`${formatNumber(sold)} / ${formatNumber(capacity)}`} hint={capacity ? t('manage.capacityPercent', { percent: Math.round((sold / capacity) * 100) }) : undefined} icon={<TicketIcon className="size-5" />} tone="slate" />
        <StatCard label={t('analytics.grossSales')} value={formatKzt(analytics?.revenue.grossSales ?? 0)} hint={t('manage.demoRevenue')} icon={<span className="text-base font-bold">₸</span>} />
        <StatCard label={t('manage.registrationsToday')} value={formatNumber(todaySales)} icon={<UsersIcon className="size-5" />} />
        <StatCard label={t('analytics.checkedIn')} value={formatNumber(analytics?.attendance.checkedIn ?? 0)} hint={daysToStart > 0 ? t('manage.startsIn', { days: daysToStart }) : t('manage.ofRegistered', { count: formatNumber(analytics?.attendance.registered ?? 0) })} icon={<ScanIcon className="size-5" />} />
      </section>

      <section>
        <h2 className={sectionTitle}>{t('manageEvent.inventoryTitle')}</h2>
        {types.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{t('manageEvent.noTypes')} <button type="button" onClick={() => onOpenTab('tickets')} className="font-bold text-brand-500">{t('setup.addType')}</button></p>
        ) : (
          <div className={`${tableWrap} mt-4`}>
            <table className={`${table} min-w-[720px]`}>
              <thead className={thead}><tr><th className={th}>{t('setup.ticketType')}</th><th className={th}>{t('manageEvent.price')}</th><th className={th}>{t('manage.available')}</th><th className={th}>{t('analytics.reserved')}</th><th className={th}>{t('manage.sold')}</th><th className={th}>{t('analytics.refunded')}</th><th className={th}>{t('analytics.checkedIn')}</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {types.map((type) => (
                  <tr key={type.id}>
                    <td className={`${td} font-bold text-slate-900`}>{type.name}{type.isHidden && <span className="ml-2 text-xs font-normal text-slate-500">({t('manageEvent.hidden')})</span>}</td>
                    <td className={td}>{type.price ? formatKzt(type.price) : t('event.free')}</td>
                    <td className={td}>{type.availableQuantity}</td>
                    <td className={td}>{type.reservedQuantity}</td>
                    <td className={td}>{type.soldQuantity}</td>
                    <td className={td}>{type.refundedQuantity}</td>
                    <td className={td}>{type.checkedInQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`}>
          <h2 className="font-display text-[22px] font-bold text-slate-900">{t('manage.quickActions')}</h2>
          {event.isCancelled ? (
            <p className="mt-4 rounded-xl bg-[#FEE2E2] p-4 text-sm text-[#B91C1C]">{t('manage.cancelledNote')}</p>
          ) : (
            <div className="mt-5 space-y-3">
              <button type="button" disabled={busy || event.isSuspended} onClick={() => void togglePublished()} className={`${secondaryButton} h-12 w-full text-[15px]`}><EyeIcon className="size-5" />{event.isPublished ? t('manage.unpublish') : t('setup.publish')}</button>
              <button type="button" disabled={busy} onClick={() => void duplicate()} className={`${secondaryButton} h-12 w-full text-[15px]`}>{t('manage.duplicateDraft')}</button>
              <button type="button" disabled={busy} onClick={() => setCancelling(true)} className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-[#B91C1C] bg-white text-[15px] font-bold text-[#B91C1C] hover:bg-rose-50 disabled:opacity-50">{t('cancelEvent.button')}</button>
            </div>
          )}
        </section>
        <section className={`${card} p-6`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[22px] font-bold text-slate-900">{t('manage.tab.paid')}</h2>
            <Badge tone={paidTone}>{t(`paidSales.status.${paidStatus}`)}</Badge>
          </div>
          <p className="mt-4 text-[15px] text-slate-600">{t(`manage.paidSummary.${paidStatus}`)}</p>
          {event.refundPolicy && <><p className="mt-5 text-[13px] font-bold text-slate-600">{t('event.refundPolicy')}</p><p className="mt-1 text-[15px] text-slate-800">{event.refundPolicy}</p></>}
          <button type="button" onClick={() => onOpenTab('paid')} className={`${secondaryButton} mt-6 h-12 px-8`}>{t('manage.managePaid')}</button>
        </section>
      </div>

      <section>
        <h2 className={sectionTitle}>{t('manage.recentActivity')}</h2>
        {history.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t('history.empty')}</p> : (
          <ul className="mt-4 space-y-4">
            {history.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 size-3 shrink-0 rounded-full bg-brand-500" />
                <span>
                  <span className="block font-bold text-slate-900">{activityLabel(entry.actionType)}: {entry.description}</span>
                  <span className="block text-[13px] text-slate-500">{formatDateTime(entry.createdAt)}{entry.actorEmail ? `, ${entry.actorEmail}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => onOpenTab('history')} className="mt-4 text-sm font-bold text-brand-500 hover:text-brand-700">{t('manage.allActivity')}</button>
      </section>

      {cancelling && <CancelEventModal event={event} onClose={() => setCancelling(false)} onCancelled={(cancelled) => { setCancelling(false); onUpdate(cancelled); onMessage(t('manage.cancelledMessage', { date: formatDate(new Date().toISOString()) })) }} />}
    </div>
  )
}
