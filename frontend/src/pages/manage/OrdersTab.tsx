import { useEffect, useState } from 'react'
import { cancelFreeOrder, getEventOrders, type Order } from '../../api/events'
import { getEventRefunds, refundOrder, type Refund } from '../../api/platform'
import { Badge } from '../../components/EventCard'
import { inputClass } from '../../components/form'
import { AlertIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { formatDateTime, formatKzt, orderCode } from '../../lib/format'
import { isMessageKey, useLocale, type MessageKey } from '../../lib/i18n'
import { dangerButton, Empty, secondaryButton, StatCard, table, tableWrap, td, th, thead } from './ui'

function orderBadge(order: Order): { label: MessageKey; tone: 'green' | 'amber' | 'slate' | 'cyan' } {
  if (order.status === 'Confirmed') return { label: order.total > 0 ? 'orders.paid' : 'orders.freeRegistration', tone: 'green' }
  if (order.status === 'Pending') return { label: 'orders.status.Pending', tone: 'cyan' }
  if (order.status === 'Refunded') return { label: 'orders.status.Refunded', tone: 'amber' }
  return { label: 'orders.status.Cancelled', tone: 'slate' }
}

/** Orders with totals, an order detail dialog and refunds (designs 4.7 and 4.8). */
export function OrdersTab({ eventId, openOrderId, onCloseOrder, onOpenOrder, onError, onMessage }: {
  eventId: string
  openOrderId: string | null
  onOpenOrder: (orderId: string) => void
  onCloseOrder: () => void
  onError: (value: string) => void
  onMessage: (value: string) => void
}) {
  const { t } = useLocale()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [refunds, setRefunds] = useState<Refund[]>([])

  useEffect(() => {
    let active = true
    Promise.all([getEventOrders(eventId), getEventRefunds(eventId)])
      .then(([orderRows, refundRows]) => { if (active) { setOrders(orderRows); setRefunds(refundRows) } })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.ordersLoadError')) })
    return () => { active = false }
  }, [eventId, onError, t])

  async function apply(action: () => Promise<Order>, done: string) {
    const updated = await action()
    setOrders((current) => current?.map((order) => order.id === updated.id ? updated : order) ?? null)
    setRefunds(await getEventRefunds(eventId))
    onMessage(done)
  }

  if (!orders) return <p className="text-slate-500">{t('manageEvent.loading')}</p>
  const settled = orders.filter((order) => order.status === 'Confirmed' || order.status === 'Refunded')
  const gross = settled.reduce((sum, order) => sum + order.total + order.discountTotal, 0)
  const discounts = settled.reduce((sum, order) => sum + order.discountTotal, 0)
  const fees = orders.filter((order) => order.status === 'Confirmed').reduce((sum, order) => sum + order.feeTotal, 0)
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0)
  const open = openOrderId ? orders.find((order) => order.id === openOrderId) ?? null : null

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={t('analytics.grossSales')} value={formatKzt(gross)} />
        <StatCard label={t('analytics.discounts')} value={formatKzt(-discounts)} tone="amber" />
        <StatCard label={t('analytics.fees')} value={formatKzt(-fees)} />
        <StatCard label={t('analytics.refunds')} value={formatKzt(-refunded)} tone="rose" />
        <StatCard label={t('analytics.payout')} value={formatKzt(gross - discounts - fees - refunded)} tone="green" hint={t('manageEvent.demoOnly')} />
      </section>

      {orders.length === 0 ? <Empty>{t('manageEvent.noOrders')}</Empty> : (
        <div className={tableWrap}>
          <table className={`${table} min-w-[760px]`}>
            <thead className={thead}><tr><th className={th}>{t('orders.order')}</th><th className={th}>{t('role.Attendee')}</th><th className={th}>{t('manageEvent.tickets')}</th><th className={th}>{t('event.total')}</th><th className={th}>{t('orders.statusLabel')}</th><th className={th}><span className="sr-only">{t('orders.details')}</span></th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {orders.map((order) => {
                const badge = orderBadge(order)
                const first = order.items[0]?.tickets[0]
                return (
                  <tr key={order.id}>
                    <td className={td}><span className="block font-mono text-sm font-bold text-slate-900">{orderCode(order)}</span><span className="block text-[13px] text-slate-500">{formatDateTime(order.createdAt)}</span></td>
                    <td className={td}><span className="block font-bold text-slate-900">{first?.attendeeName ?? '—'}</span><span className="block text-[13px] text-slate-500">{first?.attendeeEmail}</span></td>
                    <td className={td}>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                    <td className={td}>{order.total ? formatKzt(order.total) : t('event.free')}{order.promoCode && <span className="block text-xs text-[#15803D]">{order.promoCode} −{formatKzt(order.discountTotal)}</span>}</td>
                    <td className={td}><Badge tone={badge.tone}>{t(badge.label)}</Badge></td>
                    <td className={`${td} text-right`}><button type="button" onClick={() => onOpenOrder(order.id)} className="text-[15px] font-bold text-brand-500 hover:text-brand-700">{t('orders.details')}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <OrderDetail
          key={open.id}
          order={open}
          refunds={refunds.filter((refund) => refund.orderId === open.id)}
          onClose={onCloseOrder}
          onRefund={(reason) => apply(() => refundOrder(eventId, open.id, reason), t('manage.refundedMessage', { code: orderCode(open) }))}
          onCancelFree={() => apply(() => cancelFreeOrder(eventId, open.id), t('manage.cancelledOrderMessage', { code: orderCode(open) }))}
        />
      )}
    </div>
  )
}

function OrderDetail({ order, refunds, onClose, onRefund, onCancelFree }: {
  order: Order
  refunds: Refund[]
  onClose: () => void
  onRefund: (reason: string) => Promise<void>
  onCancelFree: () => Promise<void>
}) {
  const { t } = useLocale()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const badge = orderBadge(order)
  const tickets = order.items.flatMap((item) => item.tickets)
  const statusLabel = (value: string) => { const key = `orders.ticketStatus.${value}`; return isMessageKey(key) ? t(key) : value }

  async function run(action: () => Promise<void>, failure: string) {
    setError('')
    setBusy(true)
    try {
      await action()
      setConfirming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : failure)
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <Modal title={t('manage.refundTitle')} onClose={() => setConfirming(false)}>
        <p className="mt-3 text-[15px] text-slate-600">{t('manage.refundText', { amount: formatKzt(order.total), count: tickets.length })}</p>
        <label className="mt-5 block text-[13px] font-bold text-slate-900">{t('manageEvent.refundReason')}
          <input value={reason} onChange={(change) => setReason(change.target.value)} maxLength={500} placeholder={t('manageEvent.reasonPlaceholder')} className={`${inputClass} mt-2`} />
        </label>
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#FBBF24]/60 bg-[#FEF3C7] px-4 py-4"><AlertIcon className="size-5 text-[#B45309]" /><p className="font-bold text-slate-900">{t('manage.cannotUndo')}</p></div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr]">
          <button type="button" onClick={() => setConfirming(false)} className={`${secondaryButton} h-12 px-8`}>{t('manageEvent.keepOrder')}</button>
          <button type="button" disabled={busy} onClick={() => void run(() => onRefund(reason.trim()), t('manageEvent.refundError'))} className={`${dangerButton} h-12`}>{busy ? t('manageEvent.refunding') : t('manage.refundAmount', { amount: formatKzt(order.total) })}</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={t('manage.orderTitle', { code: orderCode(order) })} onClose={onClose} width="max-w-[760px]">
      <div className="mt-2"><Badge tone={badge.tone}>{t(badge.label)}</Badge></div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="font-display text-lg font-bold text-slate-900">{t('manage.items')}</h3>
          <dl className="mt-3 space-y-2 text-[15px]">
            {order.items.map((item) => <div key={item.ticketTypeId} className="flex justify-between gap-3"><dt className="text-slate-700">{item.ticketTypeName} × {item.quantity}</dt><dd className="font-bold text-slate-900">{item.unitPrice ? formatKzt(item.unitPrice * item.quantity) : t('event.free')}</dd></div>)}
            {order.promoCode && <div className="flex justify-between gap-3"><dt className="text-slate-700">{t('checkout.promoLine', { code: order.promoCode })}</dt><dd className="font-bold text-[#15803D]">−{formatKzt(order.discountTotal)}</dd></div>}
            {order.feeTotal > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('manage.feeFromPayout')}</dt><dd className="text-slate-600">{formatKzt(order.feeTotal)}</dd></div>}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2"><dt className="font-display text-lg font-bold text-slate-900">{t('event.total')}</dt><dd className="font-display text-lg font-bold text-slate-900">{order.total ? formatKzt(order.total) : t('event.free')}</dd></div>
          </dl>
          <h3 className="mt-6 font-display text-lg font-bold text-slate-900">{t('checkout.payment')}</h3>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-slate-500">{t('manage.method')}</dt><dd className="text-slate-800">{order.total ? (order.isSimulated ? t('manage.simulatedPayment') : order.paymentMode) : t('event.free')}</dd>
            <dt className="text-slate-500">{t('manage.created')}</dt><dd className="text-slate-800">{formatDateTime(order.createdAt)}</dd>
            {order.confirmedAt && <><dt className="text-slate-500">{t('manage.confirmed')}</dt><dd className="text-slate-800">{formatDateTime(order.confirmedAt)}</dd></>}
          </dl>
          {refunds.length > 0 && (
            <>
              <h3 className="mt-6 font-display text-lg font-bold text-slate-900">{t('analytics.refunds')}</h3>
              <ul className="mt-2 space-y-1 text-sm">{refunds.map((refund) => <li key={refund.id} className="flex justify-between gap-3"><span className="text-slate-600">{formatDateTime(refund.createdAt)}{refund.reason ? ` · ${refund.reason}` : ''}</span><strong>{formatKzt(refund.amount)}</strong></li>)}</ul>
            </>
          )}
        </section>
        <section>
          <h3 className="font-display text-lg font-bold text-slate-900">{t('manage.attendeesTickets')}</h3>
          {tickets.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t('manage.noTicketsYet')}</p> : (
            <ul className="mt-3 space-y-2">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-start justify-between gap-3 rounded-xl bg-[#F1F5F9] px-4 py-3">
                  <span className="min-w-0"><span className="block font-bold text-slate-900">{ticket.attendeeName}</span><span className="block break-all text-[13px] text-slate-600">{ticket.ticketTypeName}{ticket.rowLabel ? `, ${ticket.sectionName} ${ticket.rowLabel}${ticket.seatNumber}` : ''} · {ticket.code.slice(0, 14)}…</span></span>
                  <Badge tone={ticket.status === 'Valid' ? 'green' : ticket.status === 'CheckedIn' ? 'cyan' : 'slate'}>{statusLabel(ticket.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
        <button type="button" onClick={onClose} className={secondaryButton}>{t('common.close')}</button>
        {order.status === 'Confirmed' && order.total === 0 && <button type="button" disabled={busy} onClick={() => void run(onCancelFree, t('manageEvent.cancelOrderError'))} className={dangerButton}>{busy ? t('manageEvent.cancelling') : t('manageEvent.cancelFree')}</button>}
        {order.status === 'Confirmed' && order.total > 0 && <button type="button" onClick={() => setConfirming(true)} className={dangerButton}>{t('manageEvent.refundOrder')}</button>}
      </div>
    </Modal>
  )
}
