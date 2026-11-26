import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { duplicateEvent } from '../api/events'
import { getOrganizerDashboard, type OrganizerDashboard as Dashboard } from '../api/platform'
import { getOrganizerProfile, getSupportCases, type SupportCase } from '../api/workflows'
import { Badge } from '../components/EventCard'
import { eventArt } from '../components/eventArt'
import { AlertIcon, CalendarIcon, ChatIcon, ChevronRightIcon, InfoIcon, PlusIcon, ScanIcon, SearchIcon, TicketIcon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { dayBoundary, formatEventDate, formatKzt, formatNumber } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'

const lifecycles = ['Upcoming', 'Active', 'Completed', 'Cancelled'] as const
type Lifecycle = typeof lifecycles[number]
type DashboardEvent = Dashboard['events'][number]

/** Organizer overview with Upcoming / Active / Completed / Cancelled views (SRS 4.15, 4.16; design 4.1). */
export default function OrganizerDashboard() {
  const { user } = useAuth()
  const { t } = useLocale()
  const [data, setData] = useState<Dashboard | null>(null)
  const [cases, setCases] = useState<SupportCase[]>([])
  const [name, setName] = useState('')
  const [filter, setFilter] = useState<Lifecycle>('Upcoming')
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    getOrganizerDashboard({ from: dayBoundary(from), to: dayBoundary(to, true) })
      .then((value) => { if (active) setData(value) })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('dashboard.loadError')) })
    return () => { active = false }
  }, [from, t, to])

  // Extras for the greeting and the "needs your attention" list; the page works without them.
  useEffect(() => {
    let active = true
    getSupportCases().then((rows) => { if (active) setCases(rows) }).catch(() => undefined)
    if (user?.role === 'Organizer') getOrganizerProfile().then((profile) => { if (active) setName(profile.displayName || profile.businessName) }).catch(() => undefined)
    return () => { active = false }
  }, [user?.role])

  async function duplicate(eventId: string) {
    setError('')
    setMessage('')
    try {
      const copy = await duplicateEvent(eventId)
      setMessage(t('dashboard.copied', { title: copy.title }))
      setData(await getOrganizerDashboard({ from: dayBoundary(from), to: dayBoundary(to, true) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.duplicateError'))
    }
  }

  if (error && !data) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p>
  if (!data) return <p className="text-slate-500">{t('dashboard.loading')}</p>

  const counts: Record<Lifecycle, number> = { Upcoming: data.upcoming, Active: data.active, Completed: data.completed, Cancelled: data.cancelled }
  const needle = query.trim().toLocaleLowerCase()
  const events = data.events.filter((event) => event.lifecycleStatus === filter && (!needle || event.title.toLocaleLowerCase().includes(needle)))
  const drafts = data.events.filter((event) => !event.isPublished && event.lifecycleStatus === 'Upcoming')
  const checkedIn = data.events.reduce((sum, event) => sum + event.checkedIn, 0)
  const sold = data.events.reduce((sum, event) => sum + event.ticketsSold, 0)
  const pendingActivation = data.events.filter((event) => event.paidSalesStatus === 'Pending' && event.lifecycleStatus !== 'Cancelled')
  const openCases = cases.filter((item) => item.status !== 'Resolved')
  const attention: { key: string; to: string; icon: ReactNode; title: string; text: string }[] = [
    ...pendingActivation.map((event) => ({ key: `paid-${event.eventId}`, to: `/events/${event.eventId}/manage`, icon: <AlertIcon className="size-6 text-[#B45309]" />, title: t('dashboard.finishActivation', { title: event.title }), text: t('dashboard.finishActivationText') })),
    ...drafts.slice(0, 3).map((event) => ({ key: `draft-${event.eventId}`, to: `/events/${event.eventId}/setup`, icon: <CalendarIcon className="size-6 text-brand-500" />, title: t('dashboard.finishDraft', { title: event.title }), text: t('dashboard.finishDraftText') })),
    ...(openCases.length ? [{ key: 'support', to: '/support', icon: <ChatIcon className="size-6 text-brand-500" />, title: t('dashboard.openCases', { count: openCases.length }), text: t('dashboard.openCasesText') }] : []),
  ]

  return (
    <div className="mx-auto max-w-[1100px]">
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-2xl px-8 py-8 text-white" style={{ background: 'linear-gradient(90deg, #3A41B6 0%, #5346D6 40%, #A39062 85%)' }}>
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-[32px]">{name ? t('dashboard.hello', { name }) : t('nav.dashboard')}</h1>
          <p className="mt-1 text-[15px] text-white/90">{t('dashboard.subtitleShort')}{data.isDemonstration && ` ${t('dashboard.demo')}`}</p>
        </div>
        <Link to="/events/new" className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-8 text-[15px] font-bold text-slate-900 hover:bg-amber-300"><PlusIcon className="size-5" />{t('events.create')}</Link>
      </section>

      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('dashboard.eventsLive')} value={formatNumber(data.upcoming + data.active)} hint={t('dashboard.eventsLiveHint', { drafts: drafts.length, completed: data.completed })} icon={<CalendarIcon className="size-5" />} />
        <StatCard label={t('analytics.ticketsSold')} value={formatNumber(data.ticketsSold)} hint={t('dashboard.capacityHint', { capacity: formatNumber(data.events.reduce((sum, event) => sum + event.totalCapacity, 0)) })} icon={<TicketIcon className="size-5" />} />
        <StatCard label={t('dashboard.netRevenueDemo')} value={formatKzt(data.netRevenue)} hint={t('dashboard.payoutShort', { amount: formatKzt(data.estimatedPayout) })} icon={<span className="text-base font-bold">₸</span>} />
        <StatCard label={t('dashboard.checkinRate')} value={sold ? `${Math.round((checkedIn / sold) * 100)}%` : '—'} hint={t('dashboard.checkedInHint', { count: formatNumber(checkedIn) })} icon={<ScanIcon className="size-5" />} />
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200">
          <div role="tablist" aria-label={t('dashboard.statusTabs')} className="flex gap-6 overflow-x-auto [scrollbar-width:none]">
            {lifecycles.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`-mb-px shrink-0 border-b-2 pb-3 text-[15px] transition ${filter === item ? 'border-brand-500 font-bold text-brand-500' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                {t(`dashboard.lifecycle.${item}`)} ({counts[item]})
              </button>
            ))}
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <SearchIcon className="size-5 text-slate-500" />
              <input aria-label={t('dashboard.search')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('dashboard.search')} className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-500" />
            </label>
            <input type="date" aria-label={t('analytics.from')} title={t('analytics.from')} value={from} onChange={(event) => setFrom(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
            <input type="date" aria-label={t('analytics.to')} title={t('analytics.to')} value={to} onChange={(event) => setTo(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
          </div>
        </div>

        {events.length === 0
          ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('dashboard.empty')}</p>
          : <ul className="mt-4 space-y-3">{events.map((event) => <EventRow key={event.eventId} event={event} onDuplicate={duplicate} />)}</ul>}
      </section>

      <div className="mt-8 flex gap-3 rounded-xl border border-[#C9D4EE] bg-[#EEF3FE] px-5 py-4">
        <InfoIcon className="mt-0.5 size-5 shrink-0 text-brand-500" />
        <div><p className="font-bold text-slate-900">{t('dashboard.freeTitle')}</p><p className="mt-0.5 text-sm text-slate-700">{t('dashboard.freeText')}</p></div>
      </div>

      {attention.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-[26px] font-bold text-slate-900">{t('dashboard.attention')}</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {attention.map((item) => (
              <li key={item.key}>
                <Link to={item.to} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 transition hover:border-slate-300">
                  {item.icon}
                  <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{item.title}</span><span className="block text-sm text-slate-600">{item.text}</span></span>
                  <ChevronRightIcon className="size-5 shrink-0 text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function StatCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600">{label}</p>
        <span className="grid size-9 place-items-center rounded-lg bg-[#EEF3FE] text-brand-500">{icon}</span>
      </div>
      <p className="mt-1 font-display text-[28px] font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-600">{hint}</p>
    </div>
  )
}

function EventRow({ event, onDuplicate }: { event: DashboardEvent; onDuplicate: (eventId: string) => void }) {
  const { t } = useLocale()
  const { gradient, Icon } = eventArt(event.title)
  const percent = event.totalCapacity ? Math.min(100, Math.round((event.ticketsSold / event.totalCapacity) * 100)) : 0
  const paid: Record<string, { label: MessageKey; tone: 'cyan' | 'amber' | 'rose' }> = {
    Active: { label: 'dashboard.paid.Active', tone: 'cyan' },
    Pending: { label: 'dashboard.paid.Pending', tone: 'amber' },
    Suspended: { label: 'dashboard.paid.Suspended', tone: 'rose' },
  }
  const status = event.lifecycleStatus === 'Cancelled' ? { label: 'events.cancelled' as MessageKey, tone: 'rose' as const }
    : !event.isPublished ? { label: 'events.draft' as MessageKey, tone: 'slate' as const }
    : event.lifecycleStatus === 'Active' ? { label: 'dashboard.activeNow' as MessageKey, tone: 'cyan' as const }
    : event.lifecycleStatus === 'Completed' ? { label: 'dashboard.lifecycle.Completed' as MessageKey, tone: 'slate' as const }
    : { label: 'events.published' as MessageKey, tone: 'green' as const }
  return (
    <li className="grid items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3.5 sm:grid-cols-[96px_minmax(0,1fr)_200px] xl:grid-cols-[96px_minmax(0,1fr)_180px_400px]">
      <div className={`relative hidden h-[72px] w-24 overflow-hidden rounded-lg bg-gradient-to-br sm:block ${gradient}`}>
        <div aria-hidden="true" className="absolute -right-3 -top-3 size-12 rounded-full bg-white/20" />
        <Icon className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-white" />
      </div>
      <div className="min-w-0">
        <Link to={`/events/${event.eventId}/manage`} className="font-display text-lg font-bold text-slate-900 hover:text-brand-700">{event.title}</Link>
        <p className="text-sm text-slate-600">{formatEventDate(event.startDateUtc)}</p>
        {paid[event.paidSalesStatus] && <div className="mt-1"><Badge tone={paid[event.paidSalesStatus].tone}>{t(paid[event.paidSalesStatus].label)}</Badge></div>}
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} /></div>
        <p className="mt-1.5 text-sm text-slate-600">{t('dashboard.soldOf', { sold: formatNumber(event.ticketsSold), capacity: formatNumber(event.totalCapacity) })}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-3 sm:justify-end xl:col-span-1">
        <span className="w-24"><Badge tone={status.tone}>{t(status.label)}</Badge></span>
        <Link to={`/events/${event.eventId}/manage`} className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-7 text-sm font-bold text-slate-900 hover:bg-slate-50">{t('events.manage')}</Link>
        <button type="button" onClick={() => onDuplicate(event.eventId)} className="whitespace-nowrap text-sm font-bold text-brand-500 hover:text-brand-700">{t('dashboard.duplicate')}</button>
      </div>
    </li>
  )
}
