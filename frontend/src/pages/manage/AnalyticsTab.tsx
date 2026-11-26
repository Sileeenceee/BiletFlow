import { useEffect, useState } from 'react'
import type { TicketType } from '../../api/events'
import { getTicketTypes } from '../../api/events'
import { getEventAnalytics, type EventAnalytics } from '../../api/platform'
import { TicketIcon } from '../../components/icons'
import { dayBoundary, formatDate, formatDayMonth, formatKzt, formatNumber } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import { card, Empty, StatCard, table, tableWrap, td, th, thead } from './ui'

const BAR_COLORS = ['#FBBF24', '#4D7AED', '#7C3AED', '#059669', '#E11D48', '#0891B2']

/** Event analytics (SRS 4.15, design 4.10). Revenue figures are demonstration values. */
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
  const topType = Math.max(...data.ticketTypes.map((row) => row.sold), 1)
  const filter = 'flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm'

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-3">
        <label className={filter}><span className="text-slate-500">{t('analytics.from')}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" /></label>
        <label className={filter}><span className="text-slate-500">{t('analytics.to')}</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" /></label>
        <label className={filter}><span className="text-slate-500">{t('analytics.ticketType')}:</span><select value={ticketTypeId} onChange={(event) => setTicketTypeId(event.target.value)} className="bg-transparent font-bold text-slate-900 outline-none"><option value="">{t('analytics.allTypes')}</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <p className="max-w-sm text-xs leading-5 text-slate-500 sm:ml-auto">{t('analytics.source')} {revenue.isDemonstration && t('analytics.demo')}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('analytics.capacity')} value={formatNumber(capacity.totalCapacity)} hint={t('manage.acrossTypes', { count: data.ticketTypes.length })} icon={<TicketIcon className="size-5" />} />
        <StatCard label={t('analytics.ticketsSold')} value={formatNumber(capacity.ticketsSold)} hint={data.ticketTypes.map((row) => `${row.name} ${row.sold}`).join(', ')} icon={<TicketIcon className="size-5" />} />
        <StatCard label={t('manage.remaining')} value={formatNumber(capacity.ticketsRemaining)} hint={t('manage.reservedNow', { count: formatNumber(capacity.ticketsReserved) })} icon={<TicketIcon className="size-5" />} />
        <StatCard label={t('manage.percentSold')} value={`${capacity.percentSold}%`} icon={<TicketIcon className="size-5" />} />
        <StatCard label={t('analytics.grossSales')} value={formatKzt(revenue.grossSales)} />
        <StatCard label={t('analytics.discounts')} value={formatKzt(-revenue.discounts)} tone="amber" />
        <StatCard label={t('analytics.refunds')} value={formatKzt(-revenue.refunds)} tone="rose" />
        <StatCard label={t('analytics.netDemo')} value={formatKzt(revenue.netRevenue)} tone="green" hint={t('manage.feesPayout', { fees: formatKzt(revenue.processingFees), payout: formatKzt(revenue.estimatedPayout) })} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={`${card} p-6`}>
          <h2 className="font-display text-xl font-bold text-slate-900">{t('analytics.salesTitle')}</h2>
          {data.salesOverTime.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t('analytics.noSales')}</p> : <SalesChart points={data.salesOverTime} label={t('analytics.perDay')} />}
        </section>
        <section className={`${card} p-6`}>
          <h2 className="font-display text-xl font-bold text-slate-900">{t('analytics.byTypeTitle')}</h2>
          {data.ticketTypes.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t('analytics.noTypes')}</p> : (
            <ul className="mt-5 space-y-5">
              {data.ticketTypes.map((row, index) => (
                <li key={row.ticketTypeId}>
                  <div className="flex justify-between gap-3 text-[15px]"><span className="font-bold text-slate-900">{row.name}</span><span className="font-bold text-slate-700">{t('manage.ticketsCount', { count: row.sold })}</span></div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E2E8F0]" role="img" aria-label={t('analytics.barLabel', { name: row.name, count: row.sold })}>
                    <div className="h-full rounded-full" style={{ width: `${(row.sold / topType) * 100}%`, background: BAR_COLORS[index % BAR_COLORS.length] }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t('manage.typeBreakdown', { quantity: row.quantity, reserved: row.reserved, refunded: row.refunded, checkedIn: row.checkedIn, net: formatKzt(row.netRevenue) })}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="font-display text-[23px] font-bold text-slate-900">{t('manage.campaigns')}</h2>
        {data.campaigns.length === 0 ? <div className="mt-3"><Empty>{t('analytics.noCampaigns')}</Empty></div> : (
          <div className={`${tableWrap} mt-3`}>
            <table className={`${table} min-w-[700px]`}>
              <thead className={thead}><tr><th className={th}>{t('analytics.code')}</th><th className={th}>{t('analytics.linkVisits')}</th><th className={th}>{t('analytics.redemptions')}</th><th className={th}>{t('analytics.tickets')}</th><th className={th}>{t('analytics.gross')}</th><th className={th}>{t('analytics.discount')}</th><th className={th}>{t('analytics.net')}</th></tr></thead>
              <tbody className="divide-y divide-slate-200">{data.campaigns.map((row) => (
                <tr key={row.campaignId}>
                  <td className={`${td} font-bold text-slate-900`}>{row.code}{!row.isEnabled && <span className="ml-2 text-xs font-normal text-slate-500">{t('analytics.disabled')}</span>}</td>
                  <td className={td}>{row.linkVisits}</td><td className={td}>{row.redemptions}</td><td className={td}>{row.ticketsSold}</td>
                  <td className={td}>{formatKzt(row.grossRevenue)}</td><td className={td}>{formatKzt(-row.discountTotal)}</td><td className={td}>{formatKzt(row.netRevenue)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${card} p-6`}>
        <h2 className="font-display text-xl font-bold text-slate-900">{t('manage.attendance')}</h2>
        <p className="mt-3 flex items-baseline gap-3"><span className="font-display text-[34px] font-bold text-slate-900">{formatNumber(attendance.checkedIn)}</span><span className="text-[15px] text-slate-600">{t('manage.ofCheckedIn', { count: formatNumber(attendance.registered) })}</span></p>
        <div className="mt-3 h-2.5 max-w-xl overflow-hidden rounded-full bg-[#E2E8F0]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${attendance.checkInPercentage}%` }} /></div>
        <p className="mt-2 text-[13px] text-slate-500">{t('analytics.checkedInHint', { checkedIn: attendance.checkedIn, registered: attendance.registered, absent: attendance.absent })}</p>
      </section>
    </div>
  )
}

/** Cumulative tickets sold per day as an area chart. */
function SalesChart({ points, label }: { points: EventAnalytics['salesOverTime']; label: string }) {
  const W = 560
  const H = 220
  const pad = { left: 36, right: 12, top: 12, bottom: 26 }
  const series = points.reduce<{ date: string; value: number }[]>((acc, point) => [...acc, { date: point.date, value: (acc.at(-1)?.value ?? 0) + point.ticketsSold }], [])
  // Round the top up to a value that splits into four whole steps.
  const step = Math.max(1, Math.ceil(Math.max(...series.map((point) => point.value), 1) / 4))
  const max = step * 4
  const x = (index: number) => pad.left + (series.length === 1 ? (W - pad.left - pad.right) / 2 : (index / (series.length - 1)) * (W - pad.left - pad.right))
  const y = (value: number) => pad.top + (1 - value / max) * (H - pad.top - pad.bottom)
  const line = series.map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.value)}`).join(' ')
  const area = `${line} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const ticks = [0, 1, 2, 3, 4].map((n) => n * step)
  const labelEvery = Math.max(1, Math.ceil(series.length / 8))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label={label}>
      {ticks.map((tick) => <g key={tick}><line x1={pad.left} x2={W - pad.right} y1={y(tick)} y2={y(tick)} stroke="#E2E8F0" /><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="#64748B">{tick}</text></g>)}
      <path d={area} fill="#4D7AED" fillOpacity="0.12" />
      <path d={line} fill="none" stroke="#4D7AED" strokeWidth="2" />
      {series.map((point, index) => (
        <g key={point.date}>
          <circle cx={x(index)} cy={y(point.value)} r="3.5" fill="#fff" stroke="#4D7AED" strokeWidth="1.5"><title>{`${formatDate(point.date)}: ${point.value}`}</title></circle>
          {(index % labelEvery === 0 || index === series.length - 1) && <text x={x(index)} y={H - 6} textAnchor={index === series.length - 1 && series.length > 1 ? 'end' : index === 0 && series.length > 1 ? 'start' : 'middle'} fontSize="10" fill="#64748B">{formatDayMonth(point.date)}</text>}
        </g>
      ))}
    </svg>
  )
}
