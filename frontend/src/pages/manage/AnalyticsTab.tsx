import { useEffect, useState } from 'react'
import type { TicketType } from '../../api/events'
import { getTicketTypes } from '../../api/events'
import { getEventAnalytics, type EventAnalytics } from '../../api/platform'
import { inputClass } from '../../components/form'
import { dayBoundary, formatDate, formatKzt, formatNumber } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={label}>
      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
    </div>
  )
}

export function AnalyticsTab({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ticketTypeId, setTicketTypeId] = useState('')
  const [types, setTypes] = useState<TicketType[]>([])
  const [data, setData] = useState<EventAnalytics | null>(null)
  const { t } = useLocale()

  useEffect(() => {
    getTicketTypes(eventId).then(setTypes).catch(() => undefined)
  }, [eventId])

  useEffect(() => {
    let active = true
    getEventAnalytics(eventId, { from: dayBoundary(from), to: dayBoundary(to, true), ticketTypeId: ticketTypeId || undefined })
      .then((value) => { if (active) setData(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('analytics.loadError')) })
    return () => { active = false }
  }, [eventId, from, onError, t, ticketTypeId, to])

  if (!data) return <p className="text-slate-500">{t('analytics.loading')}</p>
  const { capacity, revenue, attendance } = data
  const peak = Math.max(...data.salesOverTime.map((point) => point.ticketsSold), 1)
  const topType = Math.max(...data.ticketTypes.map((row) => row.sold), 1)

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium">{t('analytics.from')}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">{t('analytics.to')}<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">{t('analytics.ticketType')}<select value={ticketTypeId} onChange={(event) => setTicketTypeId(event.target.value)} className={`${inputClass} mt-1.5`}><option value="">{t('analytics.allTypes')}</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <p className="ml-auto max-w-xs text-xs leading-5 text-slate-500">{t('analytics.source')} {revenue.isDemonstration && t('analytics.demo')}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('analytics.capacity')} value={formatNumber(capacity.totalCapacity)} hint={t('analytics.capacityHint', { remaining: formatNumber(capacity.ticketsRemaining), reserved: formatNumber(capacity.ticketsReserved) })} />
        <Stat label={t('analytics.ticketsSold')} value={formatNumber(capacity.ticketsSold)} hint={t('analytics.soldHint', { percent: capacity.percentSold })} />
        <Stat label={t('analytics.netDemo')} value={formatKzt(revenue.netRevenue)} hint={t('analytics.grossHint', { amount: formatKzt(revenue.grossSales) })} />
        <Stat label={t('analytics.checkedIn')} value={`${attendance.checkInPercentage}%`} hint={t('analytics.checkedInHint', { checkedIn: attendance.checkedIn, registered: attendance.registered, absent: attendance.absent })} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">{t('analytics.revenueTitle')}</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {([
              [t('analytics.grossSales'), revenue.grossSales],
              [t('analytics.discounts'), -revenue.discounts],
              [t('analytics.refunds'), -revenue.refunds],
              [t('analytics.fees'), -revenue.processingFees],
            ] as [string, number][]).map(([label, amount]) => (
              <div key={label} className="flex justify-between"><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{formatKzt(amount)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-bold">{t('analytics.netRevenue')}</dt><dd className="font-bold">{formatKzt(revenue.netRevenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">{t('analytics.payout')}</dt><dd className="font-semibold">{formatKzt(revenue.estimatedPayout)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">{t('analytics.ordersSummary', { confirmed: revenue.confirmedOrders, refunded: revenue.refundedOrders })}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">{t('analytics.salesTitle')}</h2>
          {data.salesOverTime.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t('analytics.noSales')}</p> : (
            <>
              <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label={t('analytics.perDay')}>
                {data.salesOverTime.map((point) => (
                  <div key={point.date} title={t('analytics.pointTitle', { date: formatDate(point.date), count: point.ticketsSold, amount: formatKzt(point.netRevenue) })} className="flex-1 rounded-t bg-indigo-500" style={{ height: `${Math.max((point.ticketsSold / peak) * 100, 3)}%` }} />
                ))}
              </div>
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400"><tr><th className="py-1">{t('analytics.day')}</th><th className="py-1">{t('analytics.tickets')}</th><th className="py-1 text-right">{t('analytics.net')}</th></tr></thead>
                <tbody>{data.salesOverTime.map((point) => <tr key={point.date} className="border-t border-slate-100"><td className="py-1.5">{formatDate(point.date)}</td><td className="py-1.5">{point.ticketsSold}</td><td className="py-1.5 text-right">{formatKzt(point.netRevenue)}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">{t('analytics.byTypeTitle')}</h2>
        {data.ticketTypes.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t('analytics.noTypes')}</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400"><tr><th className="p-2">{t('analytics.type')}</th><th className="p-2">{t('analytics.soldOfQuantity')}</th><th className="p-2">{t('analytics.reserved')}</th><th className="p-2">{t('analytics.refunded')}</th><th className="p-2">{t('analytics.checkedIn')}</th><th className="p-2 text-right">{t('analytics.net')}</th></tr></thead>
              <tbody>{data.ticketTypes.map((row) => (
                <tr key={row.ticketTypeId} className="border-t border-slate-100">
                  <td className="p-2"><strong>{row.name}</strong><span className="block text-xs text-slate-500">{row.price ? formatKzt(row.price) : t('event.free')}</span></td>
                  <td className="p-2"><span className="mb-1 block">{row.sold} / {row.quantity}</span><Bar value={row.sold} max={topType} label={t('analytics.barLabel', { name: row.name, count: row.sold })} /></td>
                  <td className="p-2">{row.reserved}</td><td className="p-2">{row.refunded}</td><td className="p-2">{row.checkedIn}</td>
                  <td className="p-2 text-right font-semibold">{formatKzt(row.netRevenue)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">{t('analytics.campaignsTitle')}</h2>
        {data.campaigns.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t('analytics.noCampaigns')}</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400"><tr><th className="p-2">{t('analytics.code')}</th><th className="p-2">{t('analytics.linkVisits')}</th><th className="p-2">{t('analytics.redemptions')}</th><th className="p-2">{t('analytics.tickets')}</th><th className="p-2">{t('analytics.gross')}</th><th className="p-2">{t('analytics.discount')}</th><th className="p-2 text-right">{t('analytics.net')}</th></tr></thead>
              <tbody>{data.campaigns.map((row) => (
                <tr key={row.campaignId} className="border-t border-slate-100">
                  <td className="p-2 font-semibold">{row.code}{!row.isEnabled && <span className="ml-2 text-xs font-normal text-slate-400">{t('analytics.disabled')}</span>}</td>
                  <td className="p-2">{row.linkVisits}</td><td className="p-2">{row.redemptions}</td><td className="p-2">{row.ticketsSold}</td>
                  <td className="p-2">{formatKzt(row.grossRevenue)}</td><td className="p-2">{formatKzt(row.discountTotal)}</td>
                  <td className="p-2 text-right font-semibold">{formatKzt(row.netRevenue)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
