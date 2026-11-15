import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import * as api from '../api/admin'
import { apiBlob } from '../api/client'
import type { SupportCase } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { useReasonDialog } from '../components/ReasonDialog'
import { formatDateTime, formatKzt, formatNumber, saveBlob } from '../lib/format'
import { Stat } from './manage/AnalyticsTab'

const tabs = ['Overview', 'Users', 'Events', 'Reports', 'Orders', 'Payments', 'Refunds', 'Activations', 'Promo', 'Support', 'Settings'] as const
type Tab = typeof tabs[number]
type Notify = { onError: (value: string) => void; onMessage: (value: string) => void }

const linkButton = 'text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50'
const dangerButton = 'text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50'

/** Administrative web portal for Platform Admins (SRS 4.12). */
export default function Admin() {
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
      <header><p className="text-sm font-semibold text-indigo-600">Platform administration</p><h1 className="mt-1 text-3xl font-black tracking-tight">Admin portal</h1><p className="mt-2 text-sm text-slate-500">Moderation, payments oversight and platform settings. All money figures are demonstration data.</p></header>
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {tabs.map((item) => <button key={item} onClick={() => switchTab(item)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{item}</button>)}
      </div>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {tab === 'Overview' && <Overview {...notify} />}
      {tab === 'Users' && <Users {...notify} />}
      {tab === 'Events' && <Events {...notify} />}
      {tab === 'Reports' && <Reports {...notify} />}
      {tab === 'Orders' && <Orders {...notify} />}
      {tab === 'Payments' && <Payments {...notify} />}
      {tab === 'Refunds' && <Listing title="Refunds" load={api.getRefunds} onError={setError} columns={['Order', 'Amount', 'Reason', 'Created']} row={(row) => [row.orderId.slice(0, 8), `${formatKzt(row.amount)}${row.isSimulated ? ' (simulated)' : ''}`, row.reason ?? '—', formatDateTime(row.createdAt)]} rowKey={(row) => row.id} />}
      {tab === 'Activations' && <Listing title="Paid-sales activation records" load={api.getActivations} onError={setError} columns={['Event', 'Organizer', 'Verified', 'Status', 'Fee', 'Fee paid', 'Terms', 'Activated']} row={(row) => [row.eventTitle, row.organizerEmail, row.organizerVerified ? 'Yes' : 'No', row.paidSalesStatus, formatKzt(row.feeAmount), row.feePaidAt ? formatDateTime(row.feePaidAt) : '—', row.termsAcceptedAt ? formatDateTime(row.termsAcceptedAt) : '—', row.activatedAt ? formatDateTime(row.activatedAt) : '—']} rowKey={(row) => row.id} />}
      {tab === 'Promo' && <Listing title="Promotional-code activity" load={api.getPromoActivity} onError={setError} columns={['Code', 'Event', 'State', 'Redemptions', 'Link visits', 'Discount given']} row={(row) => [row.code, row.eventTitle, row.isEnabled ? 'Enabled' : 'Disabled', `${row.redemptions}${row.maxRedemptions ? ` / ${row.maxRedemptions}` : ''}`, String(row.linkVisits), formatKzt(row.discountTotal)]} rowKey={(row) => row.campaignId} />}
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
  if (empty) return <p className="py-6 text-center text-sm text-slate-500">Nothing to show.</p>
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
function Listing<T>({ title, load, onError, columns, row, rowKey }: {
  title: string
  load: () => Promise<T[]>
  onError: (value: string) => void
  columns: string[]
  row: (item: T) => string[]
  rowKey: (item: T) => string
}) {
  const [rows, setRows] = useState<T[] | null>(null)
  useEffect(() => {
    let active = true
    load().then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : `Could not load ${title.toLowerCase()}.`) })
    return () => { active = false }
  }, [load, onError, title])
  return (
    <Panel title={title}>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : (
        <Table columns={columns} empty={rows.length === 0}>
          {rows.map((item) => <tr key={rowKey(item)} className="border-t border-slate-100">{row(item).map((cell, index) => <td key={index} className="p-2.5">{cell}</td>)}</tr>)}
        </Table>
      )}
    </Panel>
  )
}

function Overview({ onError }: Notify) {
  const [data, setData] = useState<api.AdminOverview | null>(null)
  const [busy, setBusy] = useState('')
  useEffect(() => {
    api.getOverview().then(setData).catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load the overview.'))
  }, [onError])

  async function download(type: string) {
    setBusy(type)
    try {
      saveBlob(await apiBlob(`/api/admin/exports/${type}`), `biletflow-${type}.csv`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy('')
    }
  }

  if (!data) return <p className="text-slate-500">Loading overview…</p>
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={formatNumber(data.users)} hint={`${data.organizers} organizers · ${data.suspendedUsers} suspended`} />
        <Stat label="Events" value={formatNumber(data.events)} hint={`${data.publishedEvents} published · ${data.suspendedEvents} suspended`} />
        <Stat label="Orders" value={formatNumber(data.orders)} hint={`${data.failedPayments} failed payments · ${data.refunds} refunds`} />
        <Stat label="Simulated gross volume" value={formatKzt(data.simulatedGrossVolume)} hint="Demonstration only" />
        <Stat label="Open reports" value={formatNumber(data.openReports)} />
        <Stat label="Escalated support cases" value={formatNumber(data.escalatedSupportCases)} />
      </section>
      <Panel title="Operational reports (CSV)">
        <div className="flex flex-wrap gap-2">
          {api.exportTypes.map((type) => <button key={type} disabled={busy === type} onClick={() => void download(type)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold capitalize text-slate-700 hover:bg-slate-50">{busy === type ? 'Preparing…' : `Export ${type}`}</button>)}
        </div>
      </Panel>
    </div>
  )
}

function Users({ onError, onMessage }: Notify) {
  const { dialog, ask } = useReasonDialog()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [rows, setRows] = useState<api.AdminUser[]>([])
  const load = useCallback(() => api.getUsers(search, role).then(setRows)
    .catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load users.')), [onError, role, search])
  useEffect(() => { void load() }, [load])

  async function act(action: () => Promise<unknown>, done: string) {
    onError('')
    try {
      await action()
      onMessage(done)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'The action failed.')
    }
  }

  return (
    <>
    {dialog}
    <Panel title="Users" actions={<div className="flex gap-2"><input aria-label="Search users" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or name" className={inputClass} /><select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)} className={inputClass}><option value="">All roles</option><option>Attendee</option><option>Organizer</option><option>EventAdmin</option><option>PlatformAdmin</option></select></div>}>
      <Table columns={['User', 'Role', 'Email', 'State', 'Joined', 'Actions']} empty={rows.length === 0}>
        {rows.map((user) => (
          <tr key={user.id} className="border-t border-slate-100">
            <td className="p-2.5"><strong>{user.email}</strong><span className="block text-xs text-slate-500">{user.fullName}</span></td>
            <td className="p-2.5"><select aria-label={`Role of ${user.email}`} value={user.role} onChange={(event) => void act(() => api.changeUserRole(user.id, event.target.value), `Role of ${user.email} changed.`)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm"><option>Attendee</option><option>Organizer</option>{user.role === 'EventAdmin' && <option>EventAdmin</option>}<option>PlatformAdmin</option></select></td>
            <td className="p-2.5">{user.emailConfirmed ? 'Verified' : 'Unverified'}</td>
            <td className="p-2.5">{user.isSuspended ? <span className="font-semibold text-rose-700">Suspended</span> : 'Active'}</td>
            <td className="p-2.5">{formatDateTime(user.createdAt)}</td>
            <td className="p-2.5">{user.isSuspended
              ? <button onClick={() => void act(() => api.reinstateUser(user.id), `${user.email} reinstated.`)} className={linkButton}>Reinstate</button>
              : <button onClick={() => void ask(`Suspend ${user.email}?`).then((reason) => { if (reason !== null) void act(() => api.suspendUser(user.id, reason), `${user.email} suspended.`) })} className={dangerButton}>Suspend</button>}</td>
          </tr>
        ))}
      </Table>
    </Panel>
    </>
  )
}

function Events({ onError, onMessage }: Notify) {
  const { dialog, ask } = useReasonDialog()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminEvent[]>([])
  const load = useCallback(() => api.getAdminEvents(search, status).then(setRows)
    .catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load events.')), [onError, search, status])
  useEffect(() => { void load() }, [load])

  async function act(action: () => Promise<unknown>, done: string) {
    onError('')
    try {
      await action()
      onMessage(done)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'The action failed.')
    }
  }
  const withReason = async (title: string, action: (reason: string) => Promise<unknown>, done: string) => {
    const reason = await ask(title)
    if (reason !== null) void act(() => action(reason), done)
  }

  return (
    <>
    {dialog}
    <Panel title="Events" actions={<div className="flex gap-2"><input aria-label="Search events" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or organizer" className={inputClass} /><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="">All</option><option value="suspended">Suspended</option><option value="reported">Reported</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></div>}>
      <Table columns={['Event', 'Organizer', 'State', 'Paid sales', 'Tickets', 'Reports', 'Actions']} empty={rows.length === 0}>
        {rows.map((event) => (
          <tr key={event.id} className="border-t border-slate-100">
            <td className="p-2.5"><Link to={`/events/${event.id}`} className="font-bold hover:underline">{event.title}</Link><span className="block text-xs text-slate-500">{formatDateTime(event.startDateUtc)} · {event.visibility}</span></td>
            <td className="p-2.5">{event.organizerEmail}</td>
            <td className="p-2.5">{event.isSuspended ? <span className="font-semibold text-rose-700">Suspended</span> : `${event.lifecycleStatus}${event.isPublished ? '' : ' · Draft'}`}</td>
            <td className="p-2.5">{event.paidSalesStatus}</td>
            <td className="p-2.5">{event.ticketsIssued}</td>
            <td className="p-2.5">{event.openReports}</td>
            <td className="p-2.5"><div className="flex flex-col items-start gap-1">
              {event.isSuspended
                ? <button onClick={() => void act(() => api.reinstateEvent(event.id), `${event.title} reinstated.`)} className={linkButton}>Reinstate event</button>
                : <button onClick={() => void withReason(`Suspend ${event.title}?`, (reason) => api.suspendEvent(event.id, reason), `${event.title} suspended; further sales are stopped.`)} className={dangerButton}>Suspend event</button>}
              {event.paidSalesStatus === 'Active' && <button onClick={() => void withReason(`Suspend paid sales of ${event.title}?`, (reason) => api.suspendPaidSales(event.id, reason), 'Paid sales suspended.')} className={dangerButton}>Suspend paid sales</button>}
              {event.paidSalesStatus === 'Suspended' && <button onClick={() => void act(() => api.reinstatePaidSales(event.id), 'Paid sales reinstated.')} className={linkButton}>Reinstate paid sales</button>}
              <Link to={`/events/${event.id}/manage?tab=history`} className={linkButton}>History</Link>
            </div></td>
          </tr>
        ))}
      </Table>
    </Panel>
    </>
  )
}

function Reports({ onError, onMessage }: Notify) {
  const { dialog, ask } = useReasonDialog()
  const [status, setStatus] = useState('Open')
  const [rows, setRows] = useState<api.EventReport[]>([])
  const load = useCallback(() => api.getReports(status).then(setRows)
    .catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load reports.')), [onError, status])
  useEffect(() => { void load() }, [load])

  async function resolve(report: api.EventReport, outcome: 'Dismissed' | 'ActionTaken', suspendEvent: boolean) {
    const note = await ask(suspendEvent ? `Suspend ${report.eventTitle} and resolve the report?` : `Resolve the report on ${report.eventTitle} as ${outcome === 'Dismissed' ? 'dismissed' : 'action taken'}?`)
    if (note === null) return
    onError('')
    try {
      await api.resolveReport(report.id, { status: outcome, note, suspendEvent })
      onMessage(`Report on ${report.eventTitle} resolved.`)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not resolve this report.')
    }
  }

  return (
    <>
    {dialog}
    <Panel title="Reported events" actions={<select aria-label="Filter reports" value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option>Open</option><option value="ActionTaken">Action taken</option><option>Dismissed</option><option value="">All</option></select>}>
      <Table columns={['Event', 'Reporter', 'Reason', 'Status', 'Created', 'Actions']} empty={rows.length === 0}>
        {rows.map((report) => (
          <tr key={report.id} className="border-t border-slate-100 align-top">
            <td className="p-2.5"><Link to={`/events/${report.eventId}`} className="font-bold hover:underline">{report.eventTitle}</Link></td>
            <td className="p-2.5">{report.reporterEmail}</td>
            <td className="p-2.5"><strong>{report.reason}</strong>{report.details && <span className="block text-xs text-slate-500">{report.details}</span>}{report.resolutionNote && <span className="block text-xs text-slate-500">Note: {report.resolutionNote}</span>}</td>
            <td className="p-2.5">{report.status}</td>
            <td className="p-2.5">{formatDateTime(report.createdAt)}</td>
            <td className="p-2.5">{report.status === 'Open' && <div className="flex flex-col items-start gap-1">
              <button onClick={() => void resolve(report, 'ActionTaken', true)} className={dangerButton}>Suspend event</button>
              <button onClick={() => void resolve(report, 'ActionTaken', false)} className={linkButton}>Mark action taken</button>
              <button onClick={() => void resolve(report, 'Dismissed', false)} className={linkButton}>Dismiss</button>
            </div>}</td>
          </tr>
        ))}
      </Table>
    </Panel>
    </>
  )
}

function SearchFilters({ label, search, onSearch, status, onStatus, statuses }: {
  label: string; search: string; onSearch: (value: string) => void; status: string; onStatus: (value: string) => void; statuses: string[]
}) {
  return (
    <div className="flex gap-2">
      <input aria-label={`Search ${label}`} value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search email, event or ID" className={inputClass} />
      <select aria-label={`Filter ${label} by status`} value={status} onChange={(event) => onStatus(event.target.value)} className={inputClass}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
    </div>
  )
}

function Orders({ onError }: Notify) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminOrder[]>([])
  useEffect(() => {
    let active = true
    api.getAdminOrders(search, status).then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load orders.') })
    return () => { active = false }
  }, [onError, search, status])
  return (
    <Panel title="Orders" actions={<SearchFilters label="orders" search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={['Pending', 'Confirmed', 'Cancelled', 'Refunded']} />}>
      <Table columns={['Order', 'Event', 'Attendee', 'Status', 'Total', 'Promo', 'Created']} empty={rows.length === 0}>
        {rows.map((order) => <tr key={order.id} className="border-t border-slate-100"><td className="p-2.5 font-mono text-xs">{order.id.slice(0, 8)}</td><td className="p-2.5">{order.eventTitle}</td><td className="p-2.5">{order.attendeeEmail}</td><td className="p-2.5">{order.status}</td><td className="p-2.5 font-semibold">{formatKzt(order.total)}</td><td className="p-2.5">{order.promoCode ?? '—'}</td><td className="p-2.5">{formatDateTime(order.createdAt)}</td></tr>)}
      </Table>
    </Panel>
  )
}

function Payments({ onError }: Notify) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminPayment[]>([])
  useEffect(() => {
    let active = true
    api.getPayments(search, status).then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load payments.') })
    return () => { active = false }
  }, [onError, search, status])
  return (
    <Panel title="Payments" actions={<SearchFilters label="payments" search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={['Pending', 'Succeeded', 'Failed']} />}>
      <Table columns={['Order', 'Event', 'Attendee', 'Amount', 'Status', 'Created']} empty={rows.length === 0}>
        {rows.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="p-2.5 font-mono text-xs">{payment.orderId.slice(0, 8)}</td><td className="p-2.5">{payment.eventTitle}</td><td className="p-2.5">{payment.attendeeEmail}</td><td className="p-2.5 font-semibold">{formatKzt(payment.amount)}{payment.isSimulated && <span className="ml-1 text-xs font-normal text-slate-400">simulated</span>}</td><td className="p-2.5">{payment.status === 'Failed' ? <span className="font-semibold text-rose-700">Failed</span> : payment.status}</td><td className="p-2.5">{formatDateTime(payment.createdAt)}</td></tr>)}
      </Table>
    </Panel>
  )
}

function Support({ onError }: { onError: (value: string) => void }) {
  const [escalated, setEscalated] = useState(true)
  const [rows, setRows] = useState<SupportCase[]>([])
  useEffect(() => {
    let active = true
    api.getAdminSupportCases(escalated).then((value) => { if (active) setRows(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load support cases.') })
    return () => { active = false }
  }, [escalated, onError])
  return (
    <Panel title="Support cases" actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={escalated} onChange={(event) => setEscalated(event.target.checked)} className="accent-indigo-600" />Escalated only</label>}>
      <Table columns={['Subject', 'Type', 'Category', 'Status', 'Updated', '']} empty={rows.length === 0}>
        {rows.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-2.5 font-semibold">{item.subject}</td><td className="p-2.5">{item.type}{item.isEscalated ? ' · escalated' : ''}</td><td className="p-2.5">{item.category}</td><td className="p-2.5">{item.status}</td><td className="p-2.5">{formatDateTime(item.updatedAt)}</td><td className="p-2.5"><Link to={`/support?caseId=${item.id}`} className={linkButton}>Open conversation</Link></td></tr>)}
      </Table>
    </Panel>
  )
}

function Settings({ onError, onMessage }: Notify) {
  const [settings, setSettings] = useState<api.PlatformSettings | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.getSettings().then(setSettings).catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load settings.'))
  }, [onError])

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
      onMessage('Platform settings saved.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <p className="text-slate-500">Loading settings…</p>
  return (
    <Panel title="Fees and platform settings">
      <form onSubmit={(form) => void save(form)} className="grid max-w-2xl gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Activation fee ({settings.currency})<input name="activationFeeKzt" type="number" min={0} step="1" required defaultValue={settings.activationFeeKzt} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">Processing fee (%)<input name="processingFeePercent" type="number" min={0} max={50} step="0.01" required defaultValue={settings.processingFeePercent} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium">Fixed fee per order ({settings.currency})<input name="processingFeeFixedKzt" type="number" min={0} step="1" required defaultValue={settings.processingFeeFixedKzt} className={`${inputClass} mt-1.5`} /></label>
        <div className="sm:col-span-3"><button disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save settings'}</button><span className="ml-3 text-xs text-slate-500">Last updated {formatDateTime(settings.updatedAt)}</span></div>
      </form>
    </Panel>
  )
}
