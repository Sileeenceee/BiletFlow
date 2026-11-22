import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import * as api from '../api/admin'
import { apiBlob } from '../api/client'
import type { SupportCase } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { useReasonDialog } from '../components/ReasonDialog'
import { formatDateTime, formatKzt, formatNumber, saveBlob } from '../lib/format'
import { isMessageKey, useLocale, type MessageKey } from '../lib/i18n'
import { Stat } from './manage/AnalyticsTab'

const tabs = ['Overview', 'Users', 'Events', 'Reports', 'Orders', 'Payments', 'Refunds', 'Activations', 'Promo', 'Support', 'Settings'] as const
type Tab = typeof tabs[number]
type Notify = { onError: (value: string) => void; onMessage: (value: string) => void }
type Translate = ReturnType<typeof useLocale>['t']

const linkButton = 'text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50'
const dangerButton = 'text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50'

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

/** Administrative web portal for Platform Admins (SRS 4.12). */
export default function Admin() {
  const { t } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (tabs.find((item) => item.toLowerCase() === searchParams.get('tab')) ?? 'Overview') as Tab
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const notify: Notify = { onError: setError, onMessage: setMessage }

  function switchTab(next: Tab) {
    setSearchParams(next === 'Overview' ? {} : { tab: next.toLowerCase() }, { replace: true })
    setError('')
    setMessage('')
  }

  return (
    <div className="space-y-6">
      <header><p className="text-sm font-semibold text-indigo-600">{t('admin.kicker')}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{t('admin.title')}</h1><p className="mt-2 text-sm text-slate-500">{t('admin.subtitle')}</p></header>
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {tabs.map((item) => <button key={item} onClick={() => switchTab(item)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t(`admin.tab.${item}`)}</button>)}
      </div>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {tab === 'Overview' && <Overview {...notify} />}
      {tab === 'Users' && <Users {...notify} />}
      {tab === 'Events' && <Events {...notify} />}
      {tab === 'Reports' && <Reports {...notify} />}
      {tab === 'Orders' && <Orders {...notify} />}
      {tab === 'Payments' && <Payments {...notify} />}
      {tab === 'Refunds' && <Listing title={t('admin.tab.Refunds')} loadError={t('admin.refunds.loadError')} load={api.getRefunds} onError={setError} columns={[t('orders.order'), t('admin.col.amount'), t('event.reportReason'), t('admin.col.created')]} row={(row) => [row.orderId.slice(0, 8), `${formatKzt(row.amount)}${row.isSimulated ? ` ${t('manageEvent.simulated')}` : ''}`, row.reason ?? '—', formatDateTime(row.createdAt)]} rowKey={(row) => row.id} />}
      {tab === 'Activations' && <Listing title={t('admin.activations.title')} loadError={t('admin.activations.loadError')} load={api.getActivations} onError={setError} columns={[t('dashboard.event'), t('admin.col.organizer'), t('admin.col.verified'), t('common.status'), t('admin.col.fee'), t('admin.col.feePaid'), t('admin.col.terms'), t('admin.col.activated')]} row={(row) => [row.eventTitle, row.organizerEmail, row.organizerVerified ? t('admin.yes') : t('admin.no'), enumLabel(t, `paidSales.status.${row.paidSalesStatus}`, row.paidSalesStatus), formatKzt(row.feeAmount), row.feePaidAt ? formatDateTime(row.feePaidAt) : '—', row.termsAcceptedAt ? formatDateTime(row.termsAcceptedAt) : '—', row.activatedAt ? formatDateTime(row.activatedAt) : '—']} rowKey={(row) => row.id} />}
      {tab === 'Promo' && <Listing title={t('admin.promo.title')} loadError={t('admin.promo.loadError')} load={api.getPromoActivity} onError={setError} columns={[t('analytics.code'), t('dashboard.event'), t('admin.col.state'), t('analytics.redemptions'), t('analytics.linkVisits'), t('admin.col.discountGiven')]} row={(row) => [row.code, row.eventTitle, row.isEnabled ? t('admin.promo.enabled') : t('admin.promo.disabled'), `${row.redemptions}${row.maxRedemptions ? ` / ${row.maxRedemptions}` : ''}`, String(row.linkVisits), formatKzt(row.discountTotal)]} rowKey={(row) => row.campaignId} />}
      {tab === 'Support' && <Support onError={setError} />}
      {tab === 'Settings' && <Settings {...notify} />}
    </div>
  )
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-xl font-bold">{title}</h2>{actions}</div>
      {children}
    </section>
  )
}

function Table({ columns, children, empty }: { columns: string[]; children: ReactNode; empty: boolean }) {
  const { t } = useLocale()
  if (empty) return <p className="py-6 text-center text-sm text-slate-500">{t('admin.empty')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase text-slate-400"><tr>{columns.map((column) => <th key={column} className="p-2.5">{column}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** Read-only table for the simple record lists. */
function Listing<T>({ title, loadError, load, onError, columns, row, rowKey }: {
  title: string
  loadError: string
  load: () => Promise<T[]>
  onError: (value: string) => void
  columns: string[]
  row: (item: T) => string[]
  rowKey: (item: T) => string
}) {
  const { t } = useLocale()
  const [rows, setRows] = useState<T[] | null>(null)
  useEffect(() => {
    let active = true
    load().then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : loadError) })
    return () => { active = false }
  }, [load, onError, loadError])
  return (
    <Panel title={title}>
      {!rows ? <p className="text-sm text-slate-500">{t('admin.loading')}</p> : (
        <Table columns={columns} empty={rows.length === 0}>
          {rows.map((item) => <tr key={rowKey(item)} className="border-t border-slate-100">{row(item).map((cell, index) => <td key={index} className="p-2.5">{cell}</td>)}</tr>)}
        </Table>
      )}
    </Panel>
  )
}

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
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('admin.tab.Users')} value={formatNumber(data.users)} hint={t('admin.stat.usersHint', { organizers: data.organizers, suspended: data.suspendedUsers })} />
        <Stat label={t('admin.tab.Events')} value={formatNumber(data.events)} hint={t('admin.stat.eventsHint', { published: data.publishedEvents, suspended: data.suspendedEvents })} />
        <Stat label={t('admin.tab.Orders')} value={formatNumber(data.orders)} hint={t('admin.stat.ordersHint', { failed: data.failedPayments, refunds: data.refunds })} />
        <Stat label={t('admin.stat.gross')} value={formatKzt(data.simulatedGrossVolume)} hint={t('manageEvent.demoOnly')} />
        <Stat label={t('admin.stat.openReports')} value={formatNumber(data.openReports)} />
        <Stat label={t('admin.stat.escalated')} value={formatNumber(data.escalatedSupportCases)} />
      </section>
      <Panel title={t('admin.exportsTitle')}>
        <div className="flex flex-wrap gap-2">
          {api.exportTypes.map((type) => <button key={type} disabled={busy === type} onClick={() => void download(type)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{busy === type ? t('admin.preparing') : t(exportLabels[type])}</button>)}
        </div>
      </Panel>
    </div>
  )
}

function Users({ onError, onMessage }: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [role, setRole] = useState('')
  const [rows, setRows] = useState<api.AdminUser[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const loadError = t('admin.users.loadError')

  useEffect(() => {
    const controller = new AbortController()
    api.getUsers(debouncedSearch, role, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError)
      })
    return () => controller.abort()
  }, [debouncedSearch, onError, reloadKey, role, loadError])

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

  return (
    <>
    {dialog}
    <Panel title={t('admin.tab.Users')} actions={<div className="flex gap-2"><input aria-label={t('admin.users.search')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('admin.users.searchPlaceholder')} className={inputClass} /><select aria-label={t('admin.users.roleFilter')} value={role} onChange={(event) => setRole(event.target.value)} className={inputClass}><option value="">{t('admin.users.allRoles')}</option>{roles.map((item) => <option key={item} value={item}>{enumLabel(t, `role.${item}`, item)}</option>)}</select></div>}>
      <Table columns={[t('admin.col.user'), t('admin.col.role'), t('form.email'), t('admin.col.state'), t('admin.col.joined'), t('common.actions')]} empty={rows.length === 0}>
        {rows.map((user) => (
          <tr key={user.id} className="border-t border-slate-100">
            <td className="p-2.5"><strong>{user.email}</strong><span className="block text-xs text-slate-500">{user.fullName}</span></td>
            <td className="p-2.5"><select aria-label={t('admin.users.roleOf', { email: user.email })} value={user.role} onChange={(event) => void act(() => api.changeUserRole(user.id, event.target.value), t('admin.users.roleChanged', { email: user.email }))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm">{roles.filter((item) => item !== 'EventAdmin' || user.role === 'EventAdmin').map((item) => <option key={item} value={item}>{enumLabel(t, `role.${item}`, item)}</option>)}</select></td>
            <td className="p-2.5">{user.emailConfirmed ? t('organizerProfile.verified') : t('organizerProfile.notVerified')}</td>
            <td className="p-2.5">{user.isSuspended ? <span className="font-semibold text-rose-700">{t('admin.users.suspended')}</span> : t('admin.users.active')}</td>
            <td className="p-2.5">{formatDateTime(user.createdAt)}</td>
            <td className="p-2.5">{user.isSuspended
              ? <button onClick={() => void act(() => api.reinstateUser(user.id), t('admin.users.reinstated', { email: user.email }))} className={linkButton}>{t('admin.users.reinstate')}</button>
              : <button onClick={() => void ask(t('admin.users.suspendConfirm', { email: user.email })).then((reason) => { if (reason !== null) void act(() => api.suspendUser(user.id, reason), t('admin.users.suspendedMessage', { email: user.email })) })} className={dangerButton}>{t('admin.users.suspend')}</button>}</td>
          </tr>
        ))}
      </Table>
    </Panel>
    </>
  )
}

function Events({ onError, onMessage }: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminEvent[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const loadError = t('admin.events.loadError')

  useEffect(() => {
    const controller = new AbortController()
    api.getAdminEvents(debouncedSearch, status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError)
      })
    return () => controller.abort()
  }, [debouncedSearch, onError, reloadKey, status, loadError])

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
  const withReason = async (title: string, action: (reason: string) => Promise<unknown>, done: string) => {
    const reason = await ask(title)
    if (reason !== null) void act(() => action(reason), done)
  }

  return (
    <>
    {dialog}
    <Panel title={t('admin.tab.Events')} actions={<div className="flex gap-2"><input aria-label={t('events.search')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('admin.events.searchPlaceholder')} className={inputClass} /><select aria-label={t('admin.events.statusFilter')} value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="">{t('dashboard.all')}</option><option value="suspended">{t('admin.events.suspended')}</option><option value="reported">{t('admin.events.reported')}</option><option value="published">{t('events.published')}</option><option value="cancelled">{t('events.cancelled')}</option></select></div>}>
      <Table columns={[t('dashboard.event'), t('admin.col.organizer'), t('admin.col.state'), t('admin.col.paidSales'), t('manageEvent.tickets'), t('admin.col.reports'), t('common.actions')]} empty={rows.length === 0}>
        {rows.map((event) => (
          <tr key={event.id} className="border-t border-slate-100">
            <td className="p-2.5"><Link to={`/events/${event.id}`} className="font-bold hover:underline">{event.title}</Link><span className="block text-xs text-slate-500">{formatDateTime(event.startDateUtc)} · {enumLabel(t, `admin.visibility.${event.visibility}`, event.visibility)}</span></td>
            <td className="p-2.5">{event.organizerEmail}</td>
            <td className="p-2.5">{event.isSuspended ? <span className="font-semibold text-rose-700">{t('admin.events.suspended')}</span> : `${enumLabel(t, `admin.lifecycle.${event.lifecycleStatus}`, event.lifecycleStatus)}${event.isPublished ? '' : ` · ${t('events.draft')}`}`}</td>
            <td className="p-2.5">{enumLabel(t, `paidSales.status.${event.paidSalesStatus}`, event.paidSalesStatus)}</td>
            <td className="p-2.5">{event.ticketsIssued}</td>
            <td className="p-2.5">{event.openReports}</td>
            <td className="p-2.5"><div className="flex flex-col items-start gap-1">
              {event.isSuspended
                ? <button onClick={() => void act(() => api.reinstateEvent(event.id), t('admin.events.reinstated', { title: event.title }))} className={linkButton}>{t('admin.events.reinstate')}</button>
                : <button onClick={() => void withReason(t('admin.events.suspendConfirm', { title: event.title }), (reason) => api.suspendEvent(event.id, reason), t('admin.events.suspendedMessage', { title: event.title }))} className={dangerButton}>{t('admin.events.suspend')}</button>}
              {event.paidSalesStatus === 'Active' && <button onClick={() => void withReason(t('admin.events.suspendPaidConfirm', { title: event.title }), (reason) => api.suspendPaidSales(event.id, reason), t('admin.events.paidSuspended'))} className={dangerButton}>{t('admin.events.suspendPaid')}</button>}
              {event.paidSalesStatus === 'Suspended' && <button onClick={() => void act(() => api.reinstatePaidSales(event.id), t('admin.events.paidReinstated'))} className={linkButton}>{t('admin.events.reinstatePaid')}</button>}
              <Link to={`/events/${event.id}/manage?tab=history`} className={linkButton}>{t('manageEvent.tab.History')}</Link>
            </div></td>
          </tr>
        ))}
      </Table>
    </Panel>
    </>
  )
}

function Reports({ onError, onMessage }: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const [status, setStatus] = useState('Open')
  const [rows, setRows] = useState<api.EventReport[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const loadError = t('admin.reports.loadError')

  useEffect(() => {
    const controller = new AbortController()
    api.getReports(status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError)
      })
    return () => controller.abort()
  }, [onError, reloadKey, status, loadError])

  async function resolve(report: api.EventReport, outcome: 'Dismissed' | 'ActionTaken', suspendEvent: boolean) {
    const title = { title: report.eventTitle }
    const note = await ask(suspendEvent
      ? t('admin.reports.suspendConfirm', title)
      : t(outcome === 'Dismissed' ? 'admin.reports.dismissConfirm' : 'admin.reports.actionConfirm', title))
    if (note === null) return
    onError('')
    try {
      await api.resolveReport(report.id, { status: outcome, note, suspendEvent })
      onMessage(t('admin.reports.resolved', title))
      setReloadKey((key) => key + 1)
    } catch (err) {
      onError(err instanceof Error ? err.message : t('admin.reports.resolveError'))
    }
  }

  return (
    <>
    {dialog}
    <Panel title={t('admin.reports.title')} actions={<select aria-label={t('admin.reports.filter')} value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="Open">{t('admin.reportStatus.Open')}</option><option value="ActionTaken">{t('admin.reportStatus.ActionTaken')}</option><option value="Dismissed">{t('admin.reportStatus.Dismissed')}</option><option value="">{t('dashboard.all')}</option></select>}>
      <Table columns={[t('dashboard.event'), t('admin.col.reporter'), t('event.reportReason'), t('common.status'), t('admin.col.created'), t('common.actions')]} empty={rows.length === 0}>
        {rows.map((report) => (
          <tr key={report.id} className="border-t border-slate-100 align-top">
            <td className="p-2.5"><Link to={`/events/${report.eventId}`} className="font-bold hover:underline">{report.eventTitle}</Link></td>
            <td className="p-2.5">{report.reporterEmail}</td>
            <td className="p-2.5"><strong>{reportReasonKeys[report.reason] ? t(reportReasonKeys[report.reason]) : report.reason}</strong>{report.details && <span className="block text-xs text-slate-500">{report.details}</span>}{report.resolutionNote && <span className="block text-xs text-slate-500">{t('admin.reports.note', { note: report.resolutionNote })}</span>}</td>
            <td className="p-2.5">{enumLabel(t, `admin.reportStatus.${report.status}`, report.status)}</td>
            <td className="p-2.5">{formatDateTime(report.createdAt)}</td>
            <td className="p-2.5">{report.status === 'Open' && <div className="flex flex-col items-start gap-1">
              <button onClick={() => void resolve(report, 'ActionTaken', true)} className={dangerButton}>{t('admin.events.suspend')}</button>
              <button onClick={() => void resolve(report, 'ActionTaken', false)} className={linkButton}>{t('admin.reports.markAction')}</button>
              <button onClick={() => void resolve(report, 'Dismissed', false)} className={linkButton}>{t('admin.reports.dismiss')}</button>
            </div>}</td>
          </tr>
        ))}
      </Table>
    </Panel>
    </>
  )
}

function SearchFilters({ searchLabel, filterLabel, search, onSearch, status, onStatus, statuses }: {
  searchLabel: string; filterLabel: string; search: string; onSearch: (value: string) => void; status: string; onStatus: (value: string) => void; statuses: { value: string; label: string }[]
}) {
  const { t } = useLocale()
  return (
    <div className="flex gap-2">
      <input aria-label={searchLabel} value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t('admin.searchPlaceholder')} className={inputClass} />
      <select aria-label={filterLabel} value={status} onChange={(event) => onStatus(event.target.value)} className={inputClass}><option value="">{t('admin.allStatuses')}</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    </div>
  )
}

function Orders({ onError }: Notify) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminOrder[]>([])
  const loadError = t('admin.orders.loadError')
  useEffect(() => {
    const controller = new AbortController()
    api.getAdminOrders(debouncedSearch, status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError)
      })
    return () => controller.abort()
  }, [debouncedSearch, onError, status, loadError])
  const statuses = ['Pending', 'Confirmed', 'Cancelled', 'Refunded'].map((value) => ({ value, label: enumLabel(t, `orders.status.${value}`, value) }))
  return (
    <Panel title={t('admin.tab.Orders')} actions={<SearchFilters searchLabel={t('admin.orders.search')} filterLabel={t('admin.orders.filter')} search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={statuses} />}>
      <Table columns={[t('orders.order'), t('dashboard.event'), t('admin.col.attendee'), t('common.status'), t('event.total'), t('admin.col.promo'), t('admin.col.created')]} empty={rows.length === 0}>
        {rows.map((order) => <tr key={order.id} className="border-t border-slate-100"><td className="p-2.5 font-mono text-xs">{order.id.slice(0, 8)}</td><td className="p-2.5">{order.eventTitle}</td><td className="p-2.5">{order.attendeeEmail}</td><td className="p-2.5">{enumLabel(t, `orders.status.${order.status}`, order.status)}</td><td className="p-2.5 font-semibold">{formatKzt(order.total)}</td><td className="p-2.5">{order.promoCode ?? '—'}</td><td className="p-2.5">{formatDateTime(order.createdAt)}</td></tr>)}
      </Table>
    </Panel>
  )
}

function Payments({ onError }: Notify) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminPayment[]>([])
  const loadError = t('admin.payments.loadError')
  useEffect(() => {
    const controller = new AbortController()
    api.getPayments(debouncedSearch, status, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setRows(value) })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && !isAbort(err)) onError(err instanceof Error ? err.message : loadError)
      })
    return () => controller.abort()
  }, [debouncedSearch, onError, status, loadError])
  const statuses = ['Pending', 'Succeeded', 'Failed'].map((value) => ({ value, label: enumLabel(t, `admin.paymentStatus.${value}`, value) }))
  return (
    <Panel title={t('admin.tab.Payments')} actions={<SearchFilters searchLabel={t('admin.payments.search')} filterLabel={t('admin.payments.filter')} search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={statuses} />}>
      <Table columns={[t('orders.order'), t('dashboard.event'), t('admin.col.attendee'), t('admin.col.amount'), t('common.status'), t('admin.col.created')]} empty={rows.length === 0}>
        {rows.map((payment) => {
          const label = enumLabel(t, `admin.paymentStatus.${payment.status}`, payment.status)
          return <tr key={payment.id} className="border-t border-slate-100"><td className="p-2.5 font-mono text-xs">{payment.orderId.slice(0, 8)}</td><td className="p-2.5">{payment.eventTitle}</td><td className="p-2.5">{payment.attendeeEmail}</td><td className="p-2.5 font-semibold">{formatKzt(payment.amount)}{payment.isSimulated && <span className="ml-1 text-xs font-normal text-slate-400">{t('admin.simulated')}</span>}</td><td className="p-2.5">{payment.status === 'Failed' ? <span className="font-semibold text-rose-700">{label}</span> : label}</td><td className="p-2.5">{formatDateTime(payment.createdAt)}</td></tr>
        })}
      </Table>
    </Panel>
  )
}

function Support({ onError }: { onError: (value: string) => void }) {
  const { t } = useLocale()
  const [escalated, setEscalated] = useState(true)
  const [rows, setRows] = useState<SupportCase[]>([])
  const loadError = t('admin.support.loadError')
  useEffect(() => {
    let active = true
    api.getAdminSupportCases(escalated).then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : loadError) })
    return () => { active = false }
  }, [escalated, onError, loadError])
  return (
    <Panel title={t('admin.support.title')} actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={escalated} onChange={(event) => setEscalated(event.target.checked)} className="accent-indigo-600" />{t('admin.support.escalatedOnly')}</label>}>
      <Table columns={[t('support.subject'), t('admin.col.type'), t('support.categoryLabel'), t('common.status'), t('admin.col.updated'), '']} empty={rows.length === 0}>
        {rows.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-2.5 font-semibold">{item.subject}</td><td className="p-2.5">{enumLabel(t, `role.${item.type}`, item.type)}{item.isEscalated ? ` · ${t('admin.support.escalated')}` : ''}</td><td className="p-2.5">{supportCategoryKeys[item.category] ? t(supportCategoryKeys[item.category]) : item.category}</td><td className="p-2.5">{supportStatusKeys[item.status] ? t(supportStatusKeys[item.status]) : item.status}</td><td className="p-2.5">{formatDateTime(item.updatedAt)}</td><td className="p-2.5"><Link to={`/support?caseId=${item.id}`} className={linkButton}>{t('admin.support.open')}</Link></td></tr>)}
      </Table>
    </Panel>
  )
}

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
  return (
    <Panel title={t('admin.settings.title')}>
      <form onSubmit={(form) => void save(form)} className="grid max-w-2xl gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">{t('admin.settings.activationFee', { currency: settings.currency })}<input name="activationFeeKzt" type="number" min={0} step="1" required defaultValue={settings.activationFeeKzt} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">{t('admin.settings.processingFee')}<input name="processingFeePercent" type="number" min={0} max={50} step="0.01" required defaultValue={settings.processingFeePercent} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">{t('admin.settings.fixedFee', { currency: settings.currency })}<input name="processingFeeFixedKzt" type="number" min={0} step="1" required defaultValue={settings.processingFeeFixedKzt} className={`${inputClass} mt-1.5`} /></label>
        <div className="sm:col-span-3"><button disabled={busy} className={buttonClass}>{busy ? t('common.saving') : t('admin.settings.save')}</button><span className="ml-3 text-xs text-slate-500">{t('admin.settings.updated', { time: formatDateTime(settings.updatedAt) })}</span></div>
      </form>
    </Panel>
  )
}
