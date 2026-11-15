import { useEffect, useState } from 'react'
import type { TicketType } from '../../api/events'
import { getTicketTypes } from '../../api/events'
import { getEventAnalytics, type EventAnalytics } from '../../api/platform'
import { inputClass } from '../../components/form'
import { dayBoundary, formatDate, formatKzt, formatNumber } from '../../lib/format'

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

  useEffect(() => {
    getTicketTypes(eventId).then(setTypes).catch(() => undefined)
  }, [eventId])

  useEffect(() => {
    let active = true
    getEventAnalytics(eventId, { from: dayBoundary(from), to: dayBoundary(to, true), ticketTypeId: ticketTypeId || undefined })
      .then((value) => { if (active) setData(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load analytics.') })
    return () => { active = false }
  }, [eventId, from, onError, ticketTypeId, to])

  if (!data) return <p className="text-slate-500">Loading analytics…</p>
  const { capacity, revenue, attendance } = data
  const peak = Math.max(...data.salesOverTime.map((point) => point.ticketsSold), 1)
  const topType = Math.max(...data.ticketTypes.map((row) => row.sold), 1)

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">Ticket type<select value={ticketTypeId} onChange={(event) => setTicketTypeId(event.target.value)} className={`${inputClass} mt-1.5`}><option value="">All ticket types</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <p className="ml-auto max-w-xs text-xs leading-5 text-slate-500">Figures come from BiletFlow orders, tickets, refunds and check-ins. {revenue.isDemonstration && 'Revenue is demonstration data — no real money moved.'}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Capacity" value={formatNumber(capacity.totalCapacity)} hint={`${formatNumber(capacity.ticketsRemaining)} remaining · ${formatNumber(capacity.ticketsReserved)} reserved`} />
        <Stat label="Tickets sold" value={formatNumber(capacity.ticketsSold)} hint={`${capacity.percentSold}% of capacity`} />
        <Stat label="Net demo revenue" value={formatKzt(revenue.netRevenue)} hint={`Gross ${formatKzt(revenue.grossSales)}`} />
        <Stat label="Checked in" value={`${attendance.checkInPercentage}%`} hint={`${attendance.checkedIn} of ${attendance.registered} · ${attendance.absent} absent`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Revenue breakdown (KZT)</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {([
              ['Gross sales', revenue.grossSales],
              ['Discounts', -revenue.discounts],
              ['Refunds', -revenue.refunds],
              ['Processing fees', -revenue.processingFees],
            ] as [string, number][]).map(([label, amount]) => (
              <div key={label} className="flex justify-between"><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{formatKzt(amount)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-bold">Net revenue</dt><dd className="font-bold">{formatKzt(revenue.netRevenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Estimated payout</dt><dd className="font-semibold">{formatKzt(revenue.estimatedPayout)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">{revenue.confirmedOrders} confirmed orders · {revenue.refundedOrders} refunded</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Sales over time</h2>
          {data.salesOverTime.length === 0 ? <p className="mt-4 text-sm text-slate-500">No confirmed sales in this period.</p> : (
            <>
              <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label="Tickets sold per day">
                {data.salesOverTime.map((point) => (
                  <div key={point.date} title={`${formatDate(point.date)}: ${point.ticketsSold} tickets, ${formatKzt(point.netRevenue)}`} className="flex-1 rounded-t bg-indigo-500" style={{ height: `${Math.max((point.ticketsSold / peak) * 100, 3)}%` }} />
                ))}
              </div>
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400"><tr><th className="py-1">Day</th><th className="py-1">Tickets</th><th className="py-1 text-right">Net</th></tr></thead>
                <tbody>{data.salesOverTime.map((point) => <tr key={point.date} className="border-t border-slate-100"><td className="py-1.5">{formatDate(point.date)}</td><td className="py-1.5">{point.ticketsSold}</td><td className="py-1.5 text-right">{formatKzt(point.netRevenue)}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Sales by ticket type</h2>
        {data.ticketTypes.length === 0 ? <p className="mt-4 text-sm text-slate-500">No ticket types yet.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400"><tr><th className="p-2">Type</th><th className="p-2">Sold / quantity</th><th className="p-2">Reserved</th><th className="p-2">Refunded</th><th className="p-2">Checked in</th><th className="p-2 text-right">Net</th></tr></thead>
              <tbody>{data.ticketTypes.map((row) => (
                <tr key={row.ticketTypeId} className="border-t border-slate-100">
                  <td className="p-2"><strong>{row.name}</strong><span className="block text-xs text-slate-500">{row.price ? formatKzt(row.price) : 'Free'}</span></td>
                  <td className="p-2"><span className="mb-1 block">{row.sold} / {row.quantity}</span><Bar value={row.sold} max={topType} label={`${row.name}: ${row.sold} sold`} /></td>
                  <td className="p-2">{row.reserved}</td><td className="p-2">{row.refunded}</td><td className="p-2">{row.checkedIn}</td>
                  <td className="p-2 text-right font-semibold">{formatKzt(row.netRevenue)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Campaigns and promo codes</h2>
        {data.campaigns.length === 0 ? <p className="mt-4 text-sm text-slate-500">No campaigns for this event.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400"><tr><th className="p-2">Code</th><th className="p-2">Link visits</th><th className="p-2">Redemptions</th><th className="p-2">Tickets</th><th className="p-2">Gross</th><th className="p-2">Discount</th><th className="p-2 text-right">Net</th></tr></thead>
              <tbody>{data.campaigns.map((row) => (
                <tr key={row.campaignId} className="border-t border-slate-100">
                  <td className="p-2 font-semibold">{row.code}{!row.isEnabled && <span className="ml-2 text-xs font-normal text-slate-400">disabled</span>}</td>
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
