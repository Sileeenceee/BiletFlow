import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { markAllNotificationsRead } from '../api/platform'
import { getNotifications, markNotificationRead } from '../api/workflows'
import { AlertIcon, CalendarIcon, ChatIcon, CheckIcon, ShieldIcon, TicketIcon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { formatDateTime, humanize } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'

type Notification = Awaited<ReturnType<typeof getNotifications>>[number]
type Group = 'all' | 'support' | 'payments' | 'events'

// Types the API sends today; an unknown type is shown humanized and only under "All".
const typeKeys: Record<string, MessageKey> = {
  OrderConfirmed: 'notifications.type.OrderConfirmed',
  PaymentFailed: 'notifications.type.PaymentFailed',
  RefundCompleted: 'notifications.type.RefundCompleted',
  RegistrationCancelled: 'notifications.type.RegistrationCancelled',
  EventCancelled: 'notifications.type.EventCancelled',
  EventUpdated: 'notifications.type.EventUpdated',
  PaidSales: 'notifications.type.PaidSales',
  Support: 'notifications.type.Support',
  SupportCase: 'notifications.type.Support',
  Account: 'notifications.type.Account',
}
const groups: Record<Exclude<Group, 'all'>, string[]> = {
  support: ['Support', 'SupportCase'],
  payments: ['OrderConfirmed', 'PaymentFailed', 'RefundCompleted', 'PaidSales'],
  events: ['EventCancelled', 'EventUpdated', 'RegistrationCancelled'],
}

function icon(type: string): { node: ReactNode; className: string } {
  switch (type) {
    case 'PaymentFailed': return { node: <AlertIcon className="size-6" />, className: 'bg-[#FEF3C7] text-[#B45309]' }
    case 'OrderConfirmed':
    case 'RefundCompleted': return { node: <CheckIcon className="size-6" />, className: 'bg-[#DCFCE7] text-[#15803D]' }
    case 'PaidSales': return { node: <ShieldIcon className="size-6" />, className: 'bg-[#EEF3FE] text-brand-500' }
    case 'Support':
    case 'SupportCase': return { node: <ChatIcon className="size-6" />, className: 'bg-[#EEF3FE] text-brand-500' }
    case 'EventCancelled':
    case 'RegistrationCancelled': return { node: <CalendarIcon className="size-6" />, className: 'bg-[#FEE2E2] text-[#B91C1C]' }
    case 'EventUpdated': return { node: <CalendarIcon className="size-6" />, className: 'bg-[#EEF3FE] text-brand-500' }
    default: return { node: <TicketIcon className="size-6" />, className: 'bg-[#EEF3FE] text-brand-500' }
  }
}

/** In-app notification centre (SRS 4.10, design 4.13); the same events are also sent by email. */
export default function Notifications() {
  const { t } = useLocale()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[] | null>(null)
  const [group, setGroup] = useState<Group>('all')
  const [error, setError] = useState('')
  const staff = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'

  useEffect(() => {
    getNotifications().then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('notifications.loadError')))
  }, [t])

  /** Where a notification leads: its support case, the order list, or the event page. */
  function target(item: Notification): string | null {
    if (item.relatedCaseId) return `/support?caseId=${item.relatedCaseId}`
    if (item.relatedEventId && staff) return `/events/${item.relatedEventId}/manage`
    if (item.relatedOrderId) return '/orders'
    if (item.relatedEventId) return `/events/${item.relatedEventId}`
    return null
  }

  async function read(item: Notification) {
    if (item.readAt) return
    try {
      await markNotificationRead(item.id)
      setItems((current) => current?.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications.readError'))
    }
  }

  async function open(item: Notification) {
    await read(item)
    const link = target(item)
    if (link) void navigate(link)
  }

  async function readAll() {
    try {
      await markAllNotificationsRead()
      setItems(await getNotifications())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications.readAllError'))
    }
  }

  if (!items) return error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p> : <p className="text-slate-500">{t('notifications.loading')}</p>
  const unread = items.filter((item) => !item.readAt).length
  const shown = group === 'all' ? items : items.filter((item) => groups[group].includes(item.type))
  const tabs: { key: Group; label: MessageKey }[] = [
    { key: 'all', label: 'notifications.group.all' },
    { key: 'support', label: 'notifications.group.support' },
    { key: 'payments', label: 'notifications.group.payments' },
    { key: 'events', label: 'notifications.group.events' },
  ]

  return (
    <div className="mx-auto max-w-[1100px]">
      {!staff && <h1 className="mb-6 font-display text-[34px] font-bold tracking-tight text-slate-900">{t('nav.notifications')}</h1>}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200">
        <div role="tablist" aria-label={t('nav.notifications')} className="flex gap-8 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={group === tab.key} onClick={() => setGroup(tab.key)} className={`-mb-px shrink-0 border-b-2 pb-3 text-[15px] transition ${group === tab.key ? 'border-brand-500 font-bold text-brand-500' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{t(tab.label)}</button>
          ))}
        </div>
        <div className="mb-2 flex items-center gap-4">
          <span className="text-sm text-slate-600">{t('notifications.unread', { count: unread })}</span>
          {unread > 0 && <button type="button" onClick={() => void readAll()} className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('notifications.markAll')}</button>}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {shown.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('notifications.empty')}</p> : (
        <ul className="mt-6 space-y-3">
          {shown.map((item) => {
            const { node, className } = icon(item.type)
            const link = target(item)
            return (
              <li key={item.id}>
                <button type="button" onClick={() => void open(item)} disabled={!link && !!item.readAt} className="flex w-full items-start gap-5 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-left transition hover:border-slate-300 disabled:cursor-default disabled:hover:border-slate-200">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-full ${className}`}>{node}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">{typeKeys[item.type] ? t(typeKeys[item.type]) : humanize(item.type)}</span>
                    <span className="mt-0.5 block font-display text-lg font-bold text-slate-900">{item.title}</span>
                    <span className="mt-0.5 block whitespace-pre-line text-[15px] text-slate-600">{item.message}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-3">
                    <time dateTime={item.createdAt} className="text-[13px] text-slate-500">{formatDateTime(item.createdAt)}</time>
                    {!item.readAt && <span className="size-2.5 rounded-full bg-brand-500"><span className="sr-only">{t('notifications.unreadLabel')}</span></span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
