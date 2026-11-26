import { Link } from 'react-router'
import { apiBlob } from '../../api/client'
import type { Order } from '../../api/events'
import { Badge } from '../../components/EventCard'
import { AlertIcon, DownloadIcon } from '../../components/icons'
import { formatKzt, orderCode, saveBlob } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import type { Flow } from './flow'
import { card } from './shared'

/** Design 2.13: what a cancelled event means for the visitor's tickets. */
export function CancelledNotice({ flow, orders }: { flow: Flow; orders: Order[] }) {
  const { t } = useLocale()
  const { event, calendar } = flow
  return (
    <div className="mb-8">
      <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-[#FEE2E2] px-5 py-4">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-[#B91C1C]" />
        <div>
          <p className="font-bold text-slate-900">{t('cancelled.title')}</p>
          <p className="mt-0.5 text-sm text-slate-700">{t('cancelled.text')}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {orders.length > 0 && <Link to="/orders#orders" className="inline-flex h-12 items-center rounded-lg bg-brand-500 px-16 text-[15px] font-bold text-white hover:bg-brand-600">{t('cancelled.viewRefund')}</Link>}
        {calendar && (
          <button
            type="button"
            onClick={() => void apiBlob(calendar.icsUrl)
              .then((blob) => saveBlob(blob, `biletflow-${event.id}.ics`))
              .catch((err: unknown) => flow.setError(err instanceof Error ? err.message : t('event.loadError')))}
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-[15px] font-bold text-slate-900 hover:bg-slate-50"
          >
            <DownloadIcon className="size-5" />{t('cancelled.updateCalendar')}
          </button>
        )}
      </div>
    </div>
  )
}

export function RefundPanel({ orders }: { orders: Order[] }) {
  const { t } = useLocale()
  if (orders.length === 0) {
    return (
      <aside className={`${card} p-7`}>
        <h2 className="font-display text-xl font-bold text-slate-900">{t('cancelled.noSales')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('cancelled.noSalesText')}</p>
      </aside>
    )
  }
  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const refunded = order.refundTotal ?? (order.status === 'Refunded' ? order.total : 0)
        const paid = order.total > 0
        return (
          <aside key={order.id} className={`${card} p-7`} aria-label={t('cancelled.refund')}>
            <h2 className="font-display text-xl font-bold text-slate-900">{t(paid ? 'cancelled.refund' : 'cancelled.registration')}</h2>
            <p className="mt-2 text-[15px] text-slate-600">{t('cancelled.order', { code: orderCode(order) })}</p>
            <p className="mt-1 font-display text-[26px] font-bold text-slate-900">{paid ? formatKzt(refunded || order.total) : t('event.free')}</p>
            <div className="mt-2">
              {paid
                ? <Badge tone={order.status === 'Refunded' ? 'green' : 'amber'}>{t(order.status === 'Refunded' ? 'cancelled.refunded' : 'cancelled.refundPending')}</Badge>
                : <Badge tone="slate">{t('orders.status.Cancelled')}</Badge>}
            </div>
          </aside>
        )
      })}
    </div>
  )
}
