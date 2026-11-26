import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import * as api from '../api/admin'
import { apiBlob } from '../api/client'
import type { SupportCase } from '../api/workflows'
import { Badge } from '../components/EventCard'
import { inputClass } from '../components/form'
import { ChatIcon, DownloadIcon, SearchIcon, SettingsIcon, ShieldIcon, TicketIcon } from '../components/icons'
import { useReasonDialog } from '../components/ReasonDialog'
import { formatDateTime, formatKzt, formatNumber, orderCode, saveBlob } from '../lib/format'
import { isMessageKey, useLocale, type MessageKey } from '../lib/i18n'
import { card, Empty, secondaryButton, StatCard, table as tableClass, tableWrap, td, th, thead } from './manage/ui'

type Notify = { onError: (value: string) => void; onMessage: (value: string) => void }
type Translate = ReturnType<typeof useLocale>['t']
type Tone = 'green' | 'amber' | 'rose' | 'cyan' | 'slate'

const linkButton = 'text-sm font-bold text-brand-500 hover:text-brand-700 disabled:opacity-50'
const dangerLink = 'text-sm font-bold text-[#B91C1C] hover:underline disabled:opacity-50'
const roles = ['Attendee', 'Organizer', 'EventAdmin', 'PlatformAdmin']
const exportLabels: Record<typeof api.exportTypes[number], MessageKey> = {
  users: 'admin.export.users',
  events: 'admin.export.events',
  orders: 'admin.export.orders',
  payments: 'admin.export.payments',
  refunds: 'admin.export.refunds',
}
// Server values of report reasons and support cases mapped to the labels used on the attendee pages.
const reportReasonKeys: Record<string, MessageKey> = {
  'Misleading information': 'event.reason.misleading',
  'Suspected fraud': 'event.reason.fraud',
  'Prohibited content': 'event.reason.prohibited',
  Other: 'event.reason.other',
}
const supportCategoryKeys: Record<string, MessageKey> = {
  'Ticket delivery': 'support.categories.ticketDelivery',
  Payment: 'support.categories.payment',
  Refund: 'support.categories.refund',
  Seating: 'support.categories.seating',
  'Event information': 'support.categories.eventInfo',
  'Check-in': 'support.categories.checkIn',
  Account: 'support.categories.account',
  'Technical problem': 'support.categories.technical',
  Activation: 'support.categories.activation',
}
const supportStatusKeys: Record<string, MessageKey> = {
  Open: 'support.status.open',
  'In Progress': 'support.status.inProgress',
  'Waiting for Customer': 'support.status.waiting',
  Resolved: 'support.status.resolved',
}
const supportTone = (status: string): Tone => status === 'Resolved' ? 'green' : status === 'In Progress' ? 'amber' : status === 'Waiting for Customer' ? 'slate' : 'cyan'
const paidTone = (status: string): Tone => status === 'Active' ? 'green' : status === 'Pending' ? 'amber' : status === 'Suspended' ? 'rose' : 'slate'

/** Translates a server enum value through `key`, falling back to the raw value for unknown ones. */
function enumLabel(t: Translate, key: string, raw: string) {
  return isMessageKey(key) ? t(key) : raw
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/** Administrative web portal for Platform Admins (SRS 4.12; designs 3.1 to 3.5). */
export default function Admin() {
  const { section } = useParams()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lastSection, setLastSection] = useState(section)
  const notify: Notify = { onError: setError, onMessage: setMessage }

  if (lastSection !== section) {
    setLastSection(section)
    setError('')
    setMessage('')
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      {message && <p role="status" className="mb-5 rounded-xl bg-[#DCFCE7] p-3 text-sm font-bold text-[#166534]">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl bg-[#FEE2E2] p-3 text-sm text-[#B91C1C]">{error}</p>}
      {section === 'moderation' ? <Moderation {...notify} />
        : section === 'paid-sales' ? <PaidSales {...notify} />
        : section === 'settings' ? <Settings {...notify} />
        : section === 'support' ? <SupportAndPromos {...notify} />
        : <Overview {...notify} />}
    </div>
  )
}

function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><h2 className="font-display text-[26px] font-bold text-slate-900">{children}</h2>{actions}</div>
}

function Table({ columns, children, empty, minWidth = 'min-w-[720px]' }: { columns: string[]; children: ReactNode; empty: boolean; minWidth?: string }) {
  const { t } = useLocale()
  if (empty) return <Empty>{t('admin.empty')}</Empty>
  return (
    <div className={tableWrap}>
      <table className={`${tableClass} ${minWidth}`}>
        <thead className={thead}><tr>{columns.map((column, index) => <th key={`${column}-${index}`} className={th}>{column}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{children}</tbody>
      </table>
    </div>
  )
}

function Tabs<T extends string>({ items, value, onChange, label }: { items: { key: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-7 overflow-x-auto border-b border-slate-200 [scrollbar-width:none]">
      {items.map((item) => (
        <button key={item.key} type="button" role="tab" aria-selected={value === item.key} onClick={() => onChange(item.key)} className={`-mb-px shrink-0 border-b-2 pb-3 text-[15px] transition ${value === item.key ? 'border-brand-500 font-bold text-brand-500' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{item.label}</button>
      ))}
    </div>
  )
}

function useAction(onError: (value: string) => void, onMessage: (value: string) => void) {
  const { t } = useLocale()
  const [reloadKey, setReloadKey] = useState(0)
  async function act(action: () => Promise<unknown>, done: string) {
    onError('')
    try {
      await action()
      onMessage(done)
      setReloadKey((key) => key + 1)
    } catch (err) {
      onError(err instanceof Error ? err.message : t('admin.actionError'))
    }
  }
  return { act, reloadKey }
}

// ---- Overview -------------------------------------------------------------

function Overview({ onError }: Notify) {
  const { t } = useLocale()
  const [data, setData] = useState<api.AdminOverview | null>(null)
  const [busy, setBusy] = useState('')
  const loadError = t('admin.overview.loadError')
  useEffect(() => {
    api.getOverview().then(setData).catch((err: unknown) => onError(err instanceof Error ? err.message : loadError))
  }, [onError, loadError])

  async function download(type: string) {
    setBusy(type)
    try {
      saveBlob(await apiBlob(`/api/admin/exports/${type}`), `biletflow-${type}.csv`)
    } catch (err) {
      onError(err instanceof Error ? err.message : t('admin.exportError'))
    } finally {
      setBusy('')
    }
  }

  if (!data) return <p className="text-slate-500">{t('admin.overview.loading')}</p>
  const shortcuts: { to: string; label: MessageKey; text: string; Icon: typeof ShieldIcon }[] = [
    { to: '/admin/moderation', label: 'admin.nav.moderation', text: t('admin.overview.moderationText', { reports: data.openReports, suspended: data.suspendedEvents }), Icon: ShieldIcon },
    { to: '/admin/paid-sales', label: 'admin.nav.paidSales', text: t('admin.overview.paidText', { failed: data.failedPayments, refunds: data.refunds }), Icon: TicketIcon },
    { to: '/admin/support', label: 'admin.nav.support', text: t('admin.overview.supportText', { count: data.escalatedSupportCases }), Icon: ChatIcon },
    { to: '/admin/settings', label: 'admin.nav.settings', text: t('admin.overview.settingsText'), Icon: SettingsIcon },
  ]
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t('admin.tab.Users')} value={formatNumber(data.users)} hint={t('admin.stat.usersHint', { organizers: data.organizers, suspended: data.suspendedUsers })} />
        <StatCard label={t('admin.tab.Events')} value={formatNumber(data.events)} hint={t('admin.stat.eventsHint', { published: data.publishedEvents, suspended: data.suspendedEvents })} />
        <StatCard label={t('admin.tab.Orders')} value={formatNumber(data.orders)} hint={t('admin.stat.ordersHint', { failed: data.failedPayments, refunds: data.refunds })} />
        <StatCard label={t('admin.stat.gross')} value={formatKzt(data.simulatedGrossVolume)} hint={t('manageEvent.demoOnly')} />
        <StatCard label={t('admin.stat.openReports')} value={formatNumber(data.openReports)} tone={data.openReports ? 'rose' : 'slate'} />
        <StatCard label={t('admin.stat.escalated')} value={formatNumber(data.escalatedSupportCases)} tone={data.escalatedSupportCases ? 'amber' : 'slate'} />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {shortcuts.map(({ to, label, text, Icon }) => (
          <Link key={to} to={to} className={`${card} flex items-center gap-4 p-5 transition hover:border-slate-300`}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EEF3FE] text-brand-500"><Icon className="size-6" /></span>
            <span><span className="block font-display text-lg font-bold text-slate-900">{t(label)}</span><span className="block text-sm text-slate-600">{text}</span></span>
          </Link>
        ))}
      </section>
      <section className={`${card} p-6`}>
        <h2 className="font-display text-xl font-bold text-slate-900">{t('admin.exportsTitle')}</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {api.exportTypes.map((type) => <button key={type} type="button" disabled={busy === type} onClick={() => void download(type)} className={secondaryButton}><DownloadIcon className="size-4" />{busy === type ? t('admin.preparing') : t(exportLabels[type])}</button>)}
        </div>
      </section>
    </div>
  )
}

// ---- Moderation (design 3.1) ----------------------------------------------

type ModerationTab = 'events' | 'users' | 'orders' | 'payments' | 'reports'

function Moderation(notify: Notify) {
  const { t } = useLocale()
  const [tab, setTab] = useState<ModerationTab>('events')
  const [search, setSearch] = useState('')
  const [openReports, setOpenReports] = useState<number | null>(null)
  const debounced = useDebouncedValue(search)
  useEffect(() => { api.getOverview().then((data) => setOpenReports(data.openReports)).catch(() => undefined) }, [])

  return (
    <div>
      <label className="flex h-14 items-center gap-3 rounded-xl border border-slate-300 bg-white px-5">
        <SearchIcon className="size-5 text-slate-500" />
        <input aria-label={t('admin.moderation.search')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('admin.moderation.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-500" />
      </label>
      <div className="mt-6">
        <Tabs
          label={t('admin.nav.moderation')}
          value={tab}
          onChange={setTab}
          items={[
            { key: 'events', label: t('admin.tab.Events') },
            { key: 'users', label: t('admin.tab.Users') },
            { key: 'orders', label: t('admin.tab.Orders') },
            { key: 'payments', label: t('admin.tab.Payments') },
            { key: 'reports', label: openReports ? `${t('admin.tab.Reports')} (${openReports})` : t('admin.tab.Reports') },
          ]}
        />
      </div>
      <div className="mt-6">
        {tab === 'events' && <Events search={debounced} {...notify} />}
        {tab === 'users' && <Users search={debounced} {...notify} />}
        {tab === 'orders' && <Orders search={debounced} {...notify} />}
        {tab === 'payments' && <Payments search={debounced} status="" {...notify} />}
        {tab === 'reports' && <Reports {...notify} />}
      </div>
    </div>
  )
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="mb-4 h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

function Events({ search, onError, onMessage }: Notify & { search: string }) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const { act, reloadKey } = useAction(onError, onMessage)
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminEvent[] | null>(null)
  const loadError = t('admin.events.loadError')

  useEffect(() => {
    const controller = new AbortController()
    api.getAdminEvents(search, status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => { if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError) })
    return () => controller.abort()
  }, [search, onError, reloadKey, status, loadError])

  const withReason = async (title: string, warning: string, action: (reason: string) => Promise<unknown>, done: string) => {
    const reason = await ask(title, warning)
    if (reason !== null) void act(() => action(reason), done)
  }
  const stateOf = (event: api.AdminEvent): { label: string; tone: Tone } => {
    if (event.isSuspended) return { label: t('admin.events.suspended'), tone: 'rose' }
    if (event.openReports > 0) return { label: t('admin.events.reported'), tone: 'amber' }
    if (event.lifecycleStatus === 'Cancelled') return { label: t('events.cancelled'), tone: 'rose' }
    if (!event.isPublished) return { label: t('events.draft'), tone: 'slate' }
    if (event.lifecycleStatus === 'Completed') return { label: enumLabel(t, `admin.lifecycle.${event.lifecycleStatus}`, event.lifecycleStatus), tone: 'slate' }
    return { label: t('events.published'), tone: 'green' }
  }

  return (
    <>
      {dialog}
      <Filter label={t('admin.events.statusFilter')} value={status} onChange={setStatus} options={[
        { value: '', label: t('dashboard.all') }, { value: 'reported', label: t('admin.events.reported') }, { value: 'suspended', label: t('admin.events.suspended') },
        { value: 'published', label: t('events.published') }, { value: 'cancelled', label: t('events.cancelled') },
      ]} />
      {!rows ? <p className="text-slate-500">{t('admin.loading')}</p> : (
        <Table columns={[t('dashboard.event'), t('admin.col.organizer'), t('admin.col.state'), t('admin.col.reports'), t('admin.col.sales'), '']} empty={rows.length === 0} minWidth="min-w-[860px]">
          {rows.map((event) => {
            const state = stateOf(event)
            return (
              <tr key={event.id}>
                <td className={td}><Link to={`/events/${event.id}`} className="font-bold text-slate-900 hover:text-brand-700">{event.title}</Link><span className="block text-[13px] text-slate-500">{formatDateTime(event.startDateUtc)} · {enumLabel(t, `admin.visibility.${event.visibility}`, event.visibility)}</span></td>
                <td className={`${td} text-slate-700`}>{event.organizerEmail}</td>
                <td className={td}><Badge tone={state.tone}>{state.label}</Badge></td>
                <td className={td}>{event.openReports > 0 ? <span className="grid size-7 place-items-center rounded-full bg-[#FEE2E2] text-xs font-bold text-[#B91C1C]">{event.openReports}</span> : '0'}</td>
                <td className={td}>{event.paidSalesStatus === 'Suspended' ? <Badge tone="rose">{t('admin.sales.stopped')}</Badge> : enumLabel(t, `admin.sales.${event.paidSalesStatus}`, event.paidSalesStatus)}</td>
                <td className={td}>
                  <div className="flex flex-col items-start gap-1">
                    {event.isSuspended
                      ? <button type="button" onClick={() => void act(() => api.reinstateEvent(event.id), t('admin.events.reinstated', { title: event.title }))} className={linkButton}>{t('admin.events.reinstate')}</button>
                      : <button type="button" onClick={() => void withReason(t('admin.events.suspendConfirm', { title: event.title }), t('admin.events.suspendWarning'), (reason) => api.suspendEvent(event.id, reason), t('admin.events.suspendedMessage', { title: event.title }))} className={event.openReports > 0 ? dangerLink : 'text-sm font-bold text-slate-500 hover:text-[#B91C1C]'}>{t('admin.events.suspend')}</button>}
                    <Link to={`/events/${event.id}/manage?tab=history`} className={linkButton}>{t('admin.open')}</Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </Table>
      )}
    </>
  )
}

function Users({ search, onError, onMessage }: Notify & { search: string }) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const { act, reloadKey } = useAction(onError, onMessage)
  const [role, setRole] = useState('')
  const [rows, setRows] = useState<api.AdminUser[] | null>(null)
  const loadError = t('admin.users.loadError')

  useEffect(() => {
    const controller = new AbortController()
    api.getUsers(search, role, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => { if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError) })
    return () => controller.abort()
  }, [search, onError, reloadKey, role, loadError])

  return (
    <>
      {dialog}
      <Filter label={t('admin.users.roleFilter')} value={role} onChange={setRole} options={[{ value: '', label: t('admin.users.allRoles') }, ...roles.map((item) => ({ value: item, label: enumLabel(t, `role.${item}`, item) }))]} />
      {!rows ? <p className="text-slate-500">{t('admin.loading')}</p> : (
        <Table columns={[t('admin.col.user'), t('admin.col.role'), t('form.email'), t('admin.col.state'), t('admin.col.joined'), '']} empty={rows.length === 0} minWidth="min-w-[860px]">
          {rows.map((user) => (
            <tr key={user.id}>
              <td className={td}><span className="block font-bold text-slate-900">{user.email}</span><span className="block text-[13px] text-slate-500">{user.fullName}</span></td>
              <td className={td}><select aria-label={t('admin.users.roleOf', { email: user.email })} value={user.role} onChange={(event) => void act(() => api.changeUserRole(user.id, event.target.value), t('admin.users.roleChanged', { email: user.email }))} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm">{roles.filter((item) => item !== 'EventAdmin' || user.role === 'EventAdmin').map((item) => <option key={item} value={item}>{enumLabel(t, `role.${item}`, item)}</option>)}</select></td>
              <td className={td}><Badge tone={user.emailConfirmed ? 'green' : 'slate'}>{user.emailConfirmed ? t('organizerProfile.verified') : t('organizerProfile.notVerified')}</Badge></td>
              <td className={td}><Badge tone={user.isSuspended ? 'rose' : 'green'}>{user.isSuspended ? t('admin.users.suspended') : t('admin.users.active')}</Badge></td>
              <td className={`${td} text-slate-600`}>{formatDateTime(user.createdAt)}</td>
              <td className={td}>{user.isSuspended
                ? <button type="button" onClick={() => void act(() => api.reinstateUser(user.id), t('admin.users.reinstated', { email: user.email }))} className={linkButton}>{t('admin.users.reinstate')}</button>
                : <button type="button" onClick={() => void ask(t('admin.users.suspendConfirm', { email: user.email })).then((reason) => { if (reason !== null) void act(() => api.suspendUser(user.id, reason), t('admin.users.suspendedMessage', { email: user.email })) })} className={dangerLink}>{t('admin.users.suspend')}</button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

function Orders({ search, onError }: Notify & { search: string }) {
  const { t } = useLocale()
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminOrder[] | null>(null)
  const loadError = t('admin.orders.loadError')
  useEffect(() => {
    const controller = new AbortController()
    api.getAdminOrders(search, status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => { if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError) })
    return () => controller.abort()
  }, [search, onError, status, loadError])
  const tone = (value: string): Tone => value === 'Confirmed' ? 'green' : value === 'Pending' ? 'cyan' : value === 'Refunded' ? 'amber' : 'slate'
  return (
    <>
      <Filter label={t('admin.orders.filter')} value={status} onChange={setStatus} options={[{ value: '', label: t('admin.allStatuses') }, ...['Pending', 'Confirmed', 'Cancelled', 'Refunded'].map((value) => ({ value, label: enumLabel(t, `orders.status.${value}`, value) }))]} />
      {!rows ? <p className="text-slate-500">{t('admin.loading')}</p> : (
        <Table columns={[t('orders.order'), t('dashboard.event'), t('admin.col.attendee'), t('common.status'), t('event.total'), t('admin.col.promo'), t('admin.col.created')]} empty={rows.length === 0} minWidth="min-w-[860px]">
          {rows.map((order) => (
            <tr key={order.id}>
              <td className={`${td} font-mono text-sm font-bold`}>{orderCode(order)}</td>
              <td className={td}>{order.eventTitle}</td>
              <td className={`${td} text-slate-700`}>{order.attendeeEmail}</td>
              <td className={td}><Badge tone={tone(order.status)}>{enumLabel(t, `orders.status.${order.status}`, order.status)}</Badge></td>
              <td className={`${td} font-bold`}>{order.total ? formatKzt(order.total) : t('event.free')}</td>
              <td className={td}>{order.promoCode ?? '—'}</td>
              <td className={`${td} text-slate-600`}>{formatDateTime(order.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

function Payments({ search, status: fixedStatus, onError }: Notify & { search: string; status: string }) {
  const { t } = useLocale()
  const [status, setStatus] = useState(fixedStatus)
  const [rows, setRows] = useState<api.AdminPayment[] | null>(null)
  const loadError = t('admin.payments.loadError')
  useEffect(() => {
    const controller = new AbortController()
    api.getPayments(search, status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => { if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError) })
    return () => controller.abort()
  }, [search, onError, status, loadError])
  const tone = (value: string): Tone => value === 'Succeeded' ? 'green' : value === 'Failed' ? 'rose' : 'cyan'
  return (
    <>
      {!fixedStatus && <Filter label={t('admin.payments.filter')} value={status} onChange={setStatus} options={[{ value: '', label: t('admin.allStatuses') }, ...['Pending', 'Succeeded', 'Failed'].map((value) => ({ value, label: enumLabel(t, `admin.paymentStatus.${value}`, value) }))]} />}
      {!rows ? <p className="text-slate-500">{t('admin.loading')}</p> : (
        <Table columns={[t('orders.order'), t('dashboard.event'), t('admin.col.attendee'), t('admin.col.amount'), t('common.status'), t('admin.col.created')]} empty={rows.length === 0}>
          {rows.map((payment) => (
            <tr key={payment.id}>
              <td className={`${td} font-mono text-sm font-bold`}>{orderCode({ id: payment.orderId })}</td>
              <td className={td}>{payment.eventTitle}</td>
              <td className={`${td} text-slate-700`}>{payment.attendeeEmail}</td>
              <td className={`${td} font-bold`}>{formatKzt(payment.amount)}{payment.isSimulated && <span className="ml-1 text-xs font-normal text-slate-500">{t('admin.simulated')}</span>}</td>
              <td className={td}><Badge tone={tone(payment.status)}>{enumLabel(t, `admin.paymentStatus.${payment.status}`, payment.status)}</Badge></td>
              <td className={`${td} text-slate-600`}>{formatDateTime(payment.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

function Reports({ onError, onMessage }: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const { reloadKey, act } = useAction(onError, onMessage)
  const [status, setStatus] = useState('Open')
  const [rows, setRows] = useState<api.EventReport[] | null>(null)
  const loadError = t('admin.reports.loadError')

  useEffect(() => {
    const controller = new AbortController()
    api.getReports(status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => { if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError) })
    return () => controller.abort()
  }, [onError, reloadKey, status, loadError])

  async function resolve(report: api.EventReport, outcome: 'Dismissed' | 'ActionTaken', suspendEvent: boolean) {
    const title = { title: report.eventTitle }
    const note = await ask(suspendEvent
      ? t('admin.reports.suspendConfirm', title)
      : t(outcome === 'Dismissed' ? 'admin.reports.dismissConfirm' : 'admin.reports.actionConfirm', title), suspendEvent ? t('admin.events.suspendWarning') : undefined)
    if (note === null) return
    void act(() => api.resolveReport(report.id, { status: outcome, note, suspendEvent }), t('admin.reports.resolved', title))
  }

  return (
    <>
      {dialog}
      <Filter label={t('admin.reports.filter')} value={status} onChange={setStatus} options={[
        { value: 'Open', label: t('admin.reportStatus.Open') }, { value: 'ActionTaken', label: t('admin.reportStatus.ActionTaken') },
        { value: 'Dismissed', label: t('admin.reportStatus.Dismissed') }, { value: '', label: t('dashboard.all') },
      ]} />
      {!rows ? <p className="text-slate-500">{t('admin.loading')}</p> : (
        <Table columns={[t('dashboard.event'), t('admin.col.reporter'), t('event.reportReason'), t('common.status'), t('admin.col.created'), '']} empty={rows.length === 0} minWidth="min-w-[900px]">
          {rows.map((report) => (
            <tr key={report.id} className="align-top">
              <td className={td}><Link to={`/events/${report.eventId}`} className="font-bold text-slate-900 hover:text-brand-700">{report.eventTitle}</Link></td>
              <td className={`${td} text-slate-700`}>{report.reporterEmail}</td>
              <td className={td}><span className="font-bold">{reportReasonKeys[report.reason] ? t(reportReasonKeys[report.reason]) : report.reason}</span>{report.details && <span className="block text-[13px] text-slate-600">{report.details}</span>}{report.resolutionNote && <span className="block text-[13px] text-slate-500">{t('admin.reports.note', { note: report.resolutionNote })}</span>}</td>
              <td className={td}><Badge tone={report.status === 'Open' ? 'amber' : report.status === 'ActionTaken' ? 'rose' : 'slate'}>{enumLabel(t, `admin.reportStatus.${report.status}`, report.status)}</Badge></td>
              <td className={`${td} text-slate-600`}>{formatDateTime(report.createdAt)}</td>
              <td className={td}>{report.status === 'Open' && <div className="flex flex-col items-start gap-1">
                <button type="button" onClick={() => void resolve(report, 'ActionTaken', true)} className={dangerLink}>{t('admin.events.suspend')}</button>
                <button type="button" onClick={() => void resolve(report, 'ActionTaken', false)} className={linkButton}>{t('admin.reports.markAction')}</button>
                <button type="button" onClick={() => void resolve(report, 'Dismissed', false)} className={linkButton}>{t('admin.reports.dismiss')}</button>
              </div>}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

// ---- Paid sales (design 3.2) ----------------------------------------------

function PaidSales({ onError, onMessage }: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const { act, reloadKey } = useAction(onError, onMessage)
  const [rows, setRows] = useState<api.AdminActivation[] | null>(null)
  const [monitor, setMonitor] = useState<'failures' | 'refunds'>('failures')
  const [refunds, setRefunds] = useState<api.AdminRefund[] | null>(null)

  useEffect(() => {
    let active = true
    api.getActivations().then((value) => { if (active) setRows(value) }).catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('admin.activations.loadError')) })
    return () => { active = false }
  }, [onError, reloadKey, t])
  useEffect(() => {
    if (monitor !== 'refunds' || refunds) return
    api.getRefunds().then(setRefunds).catch((err: unknown) => onError(err instanceof Error ? err.message : t('admin.refunds.loadError')))
  }, [monitor, onError, refunds, t])

  return (
    <div className="space-y-10">
      {dialog}
      <section>
        <SectionTitle>{t('admin.activations.title')}</SectionTitle>
        {!rows ? <p className="text-slate-500">{t('admin.loading')}</p> : (
          <Table columns={[t('dashboard.event'), t('admin.col.organizer'), t('admin.col.verification'), t('admin.col.fee'), t('common.status'), '']} empty={rows.length === 0} minWidth="min-w-[860px]">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={td}><span className="block font-bold text-slate-900">{row.eventTitle}</span><span className="block text-[13px] text-slate-500">{row.activatedAt ? t('admin.activations.activatedOn', { time: formatDateTime(row.activatedAt) }) : row.termsAcceptedAt ? t('admin.activations.termsOn', { time: formatDateTime(row.termsAcceptedAt) }) : t('admin.activations.inProgress')}</span></td>
                <td className={`${td} text-slate-700`}>{row.organizerEmail}</td>
                <td className={td}><Badge tone={row.organizerVerified ? 'cyan' : 'slate'}>{row.organizerVerified ? t('organizerProfile.verified') : t('organizerProfile.notVerified')}</Badge></td>
                <td className={td}>{row.feePaidAt ? formatKzt(row.feeAmount) : t('admin.activations.unpaid')}</td>
                <td className={td}><Badge tone={paidTone(row.paidSalesStatus)}>{enumLabel(t, `paidSales.status.${row.paidSalesStatus}`, row.paidSalesStatus)}</Badge></td>
                <td className={td}>
                  {row.paidSalesStatus === 'Active' && <button type="button" onClick={() => void ask(t('admin.events.suspendPaidConfirm', { title: row.eventTitle }), t('admin.events.suspendWarning')).then((reason) => { if (reason !== null) void act(() => api.suspendPaidSales(row.eventId, reason), t('admin.events.paidSuspended')) })} className={dangerLink}>{t('admin.events.suspendPaid')}</button>}
                  {row.paidSalesStatus === 'Suspended' && <button type="button" onClick={() => void act(() => api.reinstatePaidSales(row.eventId), t('admin.events.paidReinstated'))} className={linkButton}>{t('admin.restore')}</button>}
                  {row.paidSalesStatus !== 'Active' && row.paidSalesStatus !== 'Suspended' && <Link to={`/events/${row.eventId}/manage?tab=paid`} className={linkButton}>{t('admin.review')}</Link>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <SectionTitle>{t('admin.paymentsMonitor')}</SectionTitle>
        <Tabs label={t('admin.paymentsMonitor')} value={monitor} onChange={setMonitor} items={[{ key: 'failures', label: t('admin.failures') }, { key: 'refunds', label: t('admin.tab.Refunds') }]} />
        <div className="mt-5">
          {monitor === 'failures' ? <Payments search="" status="Failed" onError={onError} onMessage={onMessage} /> : !refunds ? <p className="text-slate-500">{t('admin.loading')}</p> : (
            <Table columns={[t('orders.order'), t('admin.col.amount'), t('event.reportReason'), t('admin.col.created')]} empty={refunds.length === 0}>
              {refunds.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} font-mono text-sm font-bold`}>{orderCode({ id: row.orderId })}</td>
                  <td className={`${td} font-bold`}>{formatKzt(row.amount)}{row.isSimulated && <span className="ml-1 text-xs font-normal text-slate-500">{t('admin.simulated')}</span>}</td>
                  <td className={td}>{row.reason ?? '—'}</td>
                  <td className={`${td} text-slate-600`}>{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </section>
    </div>
  )
}

// ---- Support and promos (designs 3.3 and 3.4) -----------------------------

function SupportAndPromos({ onError }: Notify) {
  const { t } = useLocale()
  const [escalated, setEscalated] = useState(true)
  const [cases, setCases] = useState<SupportCase[] | null>(null)
  const [promos, setPromos] = useState<api.AdminPromoActivity[] | null>(null)

  useEffect(() => {
    let active = true
    api.getAdminSupportCases(escalated).then((value) => { if (active) setCases(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('admin.support.loadError')) })
    return () => { active = false }
  }, [escalated, onError, t])
  useEffect(() => {
    let active = true
    api.getPromoActivity().then((value) => { if (active) setPromos(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('admin.promo.loadError')) })
    return () => { active = false }
  }, [onError, t])

  function exportPromos() {
    if (!promos) return
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`
    const lines = [[t('analytics.code'), t('dashboard.event'), t('analytics.redemptions'), t('analytics.linkVisits'), t('admin.col.discountGiven'), t('admin.col.state')].map(quote).join(',')]
    for (const row of promos) lines.push([row.code, row.eventTitle, `${row.redemptions}${row.maxRedemptions ? ` / ${row.maxRedemptions}` : ''}`, String(row.linkVisits), String(row.discountTotal), row.isEnabled ? t('admin.promo.enabled') : t('admin.promo.disabled')].map(quote).join(','))
    saveBlob(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), 'biletflow-promo-activity.csv')
  }

  const promoState = (row: api.AdminPromoActivity): { label: string; tone: Tone } => !row.isEnabled ? { label: t('admin.promo.disabled'), tone: 'slate' }
    : row.maxRedemptions !== null && row.redemptions >= row.maxRedemptions ? { label: t('manage.usedUp'), tone: 'amber' }
    : { label: t('manageEvent.active'), tone: 'green' }

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle actions={<label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={escalated} onChange={(event) => setEscalated(event.target.checked)} className="size-4 accent-brand-500" />{t('admin.support.escalatedOnly')}</label>}>
          {escalated ? t('admin.support.escalatedTitle') : t('admin.support.title')}
        </SectionTitle>
        {!cases ? <p className="text-slate-500">{t('admin.loading')}</p> : (
          <Table columns={[t('support.subject'), t('support.categoryLabel'), t('admin.col.from'), t('common.status'), t('admin.col.updated'), '']} empty={cases.length === 0} minWidth="min-w-[820px]">
            {cases.map((item) => (
              <tr key={item.id}>
                <td className={td}><span className="font-bold text-slate-900">{item.subject}</span>{item.isEscalated && !escalated && <span className="ml-2 align-middle"><Badge tone="rose">{t('admin.support.escalated')}</Badge></span>}</td>
                <td className={td}>{supportCategoryKeys[item.category] ? t(supportCategoryKeys[item.category]) : item.category}</td>
                <td className={td}>{enumLabel(t, `role.${item.type}`, item.type)}</td>
                <td className={td}><Badge tone={supportTone(item.status)}>{supportStatusKeys[item.status] ? t(supportStatusKeys[item.status]) : item.status}</Badge></td>
                <td className={`${td} text-slate-600`}>{formatDateTime(item.updatedAt)}</td>
                <td className={`${td} text-right`}><Link to={`/support?caseId=${item.id}`} className={linkButton}>{t('admin.support.open')}</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <SectionTitle>{t('admin.promo.title')}</SectionTitle>
        {!promos ? <p className="text-slate-500">{t('admin.loading')}</p> : (
          <Table columns={[t('analytics.code'), t('dashboard.event'), t('admin.col.redeemed'), t('analytics.linkVisits'), t('admin.col.discountGiven'), t('common.status')]} empty={promos.length === 0}>
            {promos.map((row) => {
              const state = promoState(row)
              return (
                <tr key={row.campaignId}>
                  <td className={`${td} font-bold text-slate-900`}>{row.code}</td>
                  <td className={td}><Link to={`/events/${row.eventId}`} className="hover:text-brand-700">{row.eventTitle}</Link></td>
                  <td className={td}>{row.redemptions}{row.maxRedemptions ? ` / ${row.maxRedemptions}` : ''}</td>
                  <td className={td}>{row.linkVisits}</td>
                  <td className={td}>{formatKzt(row.discountTotal)}</td>
                  <td className={td}><Badge tone={state.tone}>{state.label}</Badge></td>
                </tr>
              )
            })}
          </Table>
        )}
        <button type="button" disabled={!promos?.length} onClick={exportPromos} className={`${secondaryButton} mt-4`}><DownloadIcon className="size-4" />{t('admin.exportReport')}</button>
      </section>
    </div>
  )
}

// ---- Platform settings (design 3.5) ---------------------------------------

function Settings({ onError, onMessage }: Notify) {
  const { t } = useLocale()
  const [settings, setSettings] = useState<api.PlatformSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const loadError = t('admin.settings.loadError')
  useEffect(() => {
    api.getSettings().then(setSettings).catch((err: unknown) => onError(err instanceof Error ? err.message : loadError))
  }, [onError, loadError])

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    onError('')
    setBusy(true)
    try {
      setSettings(await api.saveSettings({
        activationFeeKzt: Number(data.get('activationFeeKzt')),
        processingFeePercent: Number(data.get('processingFeePercent')),
        processingFeeFixedKzt: Number(data.get('processingFeeFixedKzt')),
      }))
      onMessage(t('admin.settings.saved'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('admin.settings.saveError'))
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <p className="text-slate-500">{t('admin.settings.loading')}</p>
  const label = 'block text-[13px] font-bold text-slate-900'
  return (
    <form onSubmit={(form) => void save(form)} className={`${card} p-7`}>
      <h2 className="font-display text-[23px] font-bold text-slate-900">{t('admin.settings.fees')}</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <label className={label}>{t('admin.settings.activationFee', { currency: settings.currency })}<input name="activationFeeKzt" type="number" min={0} step="1" required defaultValue={settings.activationFeeKzt} className={`${inputClass} mt-2`} /><span className="mt-1.5 block text-xs font-normal text-slate-500">{t('admin.settings.activationHint')}</span></label>
        <label className={label}>{t('admin.settings.processingFee')}<input name="processingFeePercent" type="number" min={0} max={50} step="0.01" required defaultValue={settings.processingFeePercent} className={`${inputClass} mt-2`} /><span className="mt-1.5 block text-xs font-normal text-slate-500">{t('admin.settings.processingHint')}</span></label>
        <label className={label}>{t('admin.settings.fixedFee', { currency: settings.currency })}<input name="processingFeeFixedKzt" type="number" min={0} step="1" required defaultValue={settings.processingFeeFixedKzt} className={`${inputClass} mt-2`} /><span className="mt-1.5 block text-xs font-normal text-slate-500">{t('admin.settings.fixedHint')}</span></label>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
        <span className="text-xs text-slate-500">{t('admin.settings.updated', { time: formatDateTime(settings.updatedAt) })}</span>
        <button disabled={busy} className="h-12 rounded-lg bg-brand-500 px-8 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('common.saving') : t('admin.settings.save')}</button>
      </div>
    </form>
  )
}
