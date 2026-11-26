import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { getEvents, type EventSummary } from '../api/events'
import { EventCard } from '../components/EventCard'
import { CalendarIcon, PinIcon, ScanIcon, SearchIcon, TicketIcon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { DATE_RANGES, inDateRange, type DateRange } from '../lib/eventFilters'
import { useLocale } from '../lib/i18n'

const HERO_BACKGROUND =
  'radial-gradient(60% 90% at 8% 30%, #A39062 0%, rgba(163,144,98,0) 70%), radial-gradient(50% 80% at 40% 10%, rgba(163,144,98,.85) 0%, rgba(163,144,98,0) 70%), linear-gradient(100deg, #8F7F5C 0%, #705CD2 52%, #3A41B6 100%)'

export default function Home() {
  const { user } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const [events, setEvents] = useState<EventSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const [what, setWhat] = useState('')
  const [where, setWhere] = useState('')
  const [when, setWhen] = useState<DateRange>('any')

  useEffect(() => {
    let cancelled = false
    getEvents(false)
      .then((data) => { if (!cancelled) { setEvents(data); setLoadedAt(Date.now()) } })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t('events.loadError')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [t])

  const upcoming = useMemo(() => {
    return events
      .filter((event) => !event.isCancelled && new Date(event.endDateUtc || event.startDateUtc).getTime() >= loadedAt)
      .sort((a, b) => a.startDateUtc.localeCompare(b.startDateUtc))
  }, [events, loadedAt])
  const featured = upcoming.slice(0, 3)
  const thisWeek = upcoming.slice(3).filter((event) => inDateRange(event.startDateUtc, event.endDateUtc, 'week'))
  const cities = [...new Set(events.map((event) => event.city).filter(Boolean))].sort()
  const categories = [...new Set(upcoming.map((event) => event.category?.trim()).filter((value): value is string => !!value))].slice(0, 7)

  function search(event: FormEvent) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (what.trim()) params.set('q', what.trim())
    if (where) params.set('city', where)
    if (when !== 'any') params.set('date', when)
    void navigate(`/events${params.size ? `?${params}` : ''}`)
  }

  const fieldLabel = 'block text-[11px] font-bold text-slate-500'
  const fieldInput = 'block w-full bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-900'

  return (
    <>
      <section className="relative overflow-hidden text-white" style={{ background: HERO_BACKGROUND }}>
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <h1 className="max-w-2xl font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-[58px]">
            {t('home.titleLine1')}
            <span className="block text-accent">{t('home.titleLine2')}</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-6 text-white/85">{t('home.subtitle')}</p>

          <form onSubmit={search} role="search" className="mt-10 grid max-w-4xl gap-3 rounded-xl bg-white p-2 text-slate-900 shadow-xl shadow-indigo-950/20 sm:grid-cols-[1fr_1fr_1fr_auto] sm:gap-0">
            <label className="flex items-center gap-3 px-4 py-1.5 sm:border-r sm:border-slate-200">
              <SearchIcon className="size-5 shrink-0 text-brand-500" />
              <span className="min-w-0 flex-1">
                <span className={fieldLabel}>{t('home.what')}</span>
                <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder={t('home.whatPlaceholder')} className={fieldInput} />
              </span>
            </label>
            <label className="flex items-center gap-3 px-4 py-1.5 sm:border-r sm:border-slate-200">
              <PinIcon className="size-5 shrink-0 text-brand-500" />
              <span className="min-w-0 flex-1">
                <span className={fieldLabel}>{t('home.where')}</span>
                <select value={where} onChange={(e) => setWhere(e.target.value)} className={`${fieldInput} -ml-1 cursor-pointer`}>
                  <option value="">{t('events.allCities')}</option>
                  {cities.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              </span>
            </label>
            <label className="flex items-center gap-3 px-4 py-1.5">
              <CalendarIcon className="size-5 shrink-0 text-brand-500" />
              <span className="min-w-0 flex-1">
                <span className={fieldLabel}>{t('home.when')}</span>
                <select value={when} onChange={(e) => setWhen(e.target.value as DateRange)} className={`${fieldInput} -ml-1 cursor-pointer`}>
                  {DATE_RANGES.map((range) => <option key={range} value={range}>{t(`events.date.${range}`)}</option>)}
                </select>
              </span>
            </label>
            <button type="submit" className="h-12 rounded-lg bg-brand-500 px-10 text-sm font-bold text-white transition hover:bg-brand-600">{t('home.search')}</button>
          </form>

          {categories.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/events" className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-slate-900">{t('home.all')}</Link>
              {categories.map((category) => (
                <Link key={category} to={`/events?category=${encodeURIComponent(category)}`} className="rounded-full bg-white/20 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-white/30">
                  {category}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6 lg:px-8">
        {loading && <p>{t('events.loading')}</p>}
        {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</p>}
        {!loading && !error && upcoming.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('events.emptyText')}</p>
        )}
        {featured.length > 0 && <EventRow title={t('home.featured')} events={featured} seeAll />}
        {thisWeek.length > 0 && <EventRow title={t('home.thisWeek')} events={thisWeek.slice(0, 3)} />}
      </div>

      <section className="bg-[#EEF3FE]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="font-display text-[28px] font-bold text-slate-900">{t('home.howTitle')}</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {([
              [SearchIcon, 'home.how1Title', 'home.how1Text'],
              [TicketIcon, 'home.how2Title', 'home.how2Text'],
              [ScanIcon, 'home.how3Title', 'home.how3Text'],
            ] as const).map(([Icon, title, text]) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-brand-500"><Icon className="size-6" /></span>
                <span>
                  <span className="block font-display text-lg font-bold text-slate-900">{t(title)}</span>
                  <span className="mt-1 block max-w-xs text-sm leading-6 text-slate-600">{t(text)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-2xl px-8 py-8 text-white" style={{ background: 'linear-gradient(90deg, #3A41B6 0%, #5346D6 40%, #A39062 85%)' }}>
          <h2 className="font-display text-[28px] font-bold">{t('home.hostTitle')}</h2>
          <p className="mt-1 text-[15px] text-white/85">{t('home.hostText')}</p>
          <Link to={isOrganizer ? '/events/new' : '/register?intent=organize'} className="mt-5 inline-flex h-10 items-center rounded-lg bg-accent px-8 text-sm font-bold text-slate-900 transition hover:bg-amber-300">
            {t('events.create')}
          </Link>
        </section>
      </div>
    </>
  )
}

function EventRow({ title, events, seeAll = false }: { title: string; events: EventSummary[]; seeAll?: boolean }) {
  const { t } = useLocale()
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-[28px] font-bold text-slate-900">{title}</h2>
        {seeAll && <Link to="/events" className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('home.seeAll')}</Link>}
      </div>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => <li key={event.id}><EventCard event={event} /></li>)}
      </ul>
    </section>
  )
}
