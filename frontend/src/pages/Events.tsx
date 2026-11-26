import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { cancelEvent, duplicateEvent, getEvents, type EventSummary } from '../api/events'
import { Badge, EventCard } from '../components/EventCard'
import { ChevronDownIcon, SearchIcon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { DATE_RANGES, inDateRange, isDateRange } from '../lib/eventFilters'
import { useLocale } from '../lib/i18n'

const PAGE_SIZE = 9
type Seating = 'General' | 'Assigned'

export default function Events() {
  const { user } = useAuth()
  const { t } = useLocale()
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const [events, setEvents] = useState<EventSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmCancelId, setConfirmCancelId] = useState('')
  const [params, setParams] = useSearchParams()

  // Filters live in the URL so the home-page search and category chips can link here.
  const query = params.get('q') ?? ''
  const city = params.get('city') ?? ''
  const dateParam = params.get('date')
  const date = isDateRange(dateParam) ? dateParam : 'any'
  const selectedCategories = params.getAll('category')
  const selectedSeating = params.getAll('seating') as Seating[]
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draftQuery, setDraftQuery] = useState(query)
  const [syncedQuery, setSyncedQuery] = useState(query)
  if (syncedQuery !== query) {
    // The URL changed (back button, home search): show its query in the box.
    setSyncedQuery(query)
    setDraftQuery(query)
  }

  function update(change: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params)
    change(next)
    next.delete('page')
    setParams(next, { replace: true })
  }
  const toggle = (key: string, value: string) => update((next) => {
    const values = next.getAll(key)
    next.delete(key)
    for (const item of values.includes(value) ? values.filter((v) => v !== value) : [...values, value]) next.append(key, item)
  })

  useEffect(() => {
    // Guards against setting state after the component unmounts.
    let cancelled = false
    getEvents(user?.role === 'Organizer')
      .then((data) => { if (!cancelled) setEvents(data) })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t('events.loadError')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [t, user?.role])

  const visibleEvents = useMemo(() => {
    const needle = (params.get('q') ?? '').trim().toLocaleLowerCase()
    const city = params.get('city') ?? ''
    const dateParam = params.get('date')
    const date = isDateRange(dateParam) ? dateParam : 'any'
    const categories = params.getAll('category').map((c) => c.toLocaleLowerCase())
    const selectedSeating = params.getAll('seating')
    return events
      .filter((event) => {
        const haystack = `${event.title} ${event.description} ${event.category ?? ''} ${event.venue}`.toLocaleLowerCase()
        return (!needle || haystack.includes(needle))
          && (!city || event.city.toLocaleLowerCase() === city.toLocaleLowerCase())
          && (categories.length === 0 || categories.includes((event.category ?? '').trim().toLocaleLowerCase()))
          && (selectedSeating.length === 0 || selectedSeating.includes(event.seatingMode ?? 'General'))
          && inDateRange(event.startDateUtc, event.endDateUtc, date)
      })
      .sort((a, b) => a.startDateUtc.localeCompare(b.startDateUtc))
  }, [events, params])

  async function duplicate(eventId: string) {
    setActionError('')
    try {
      const copy = await duplicateEvent(eventId)
      setEvents((current) => [copy, ...current])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('events.duplicateError'))
    }
  }

  async function cancel(eventId: string) {
    setActionError('')
    try {
      const cancelled = await cancelEvent(eventId)
      setEvents((current) => current.map((event) => event.id === cancelled.id ? cancelled : event))
      setConfirmCancelId('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('events.cancelError'))
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    update((next) => { if (draftQuery.trim()) next.set('q', draftQuery.trim()); else next.delete('q') })
  }

  if (loading) return <p>{t('events.loading')}</p>
  if (error) return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</p>

  if (events.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">{isOrganizer ? t('events.emptyOrganizerTitle') : t('events.emptyTitle')}</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-500">{isOrganizer ? t('events.emptyOrganizerText') : t('events.emptyText')}</p>
        {isOrganizer && (
          <Link to="/events/new" className="mt-6 inline-flex rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600">{t('events.createFirst')}</Link>
        )}
      </section>
    )
  }

  const cities = [...new Set(events.map((event) => event.city).filter(Boolean))].sort()
  const categories = [...new Set(events.map((event) => event.category?.trim()).filter((value): value is string => !!value))].sort()
  const pages = Math.max(1, Math.ceil(visibleEvents.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const pageEvents = visibleEvents.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const hasFilters = !!(query || city || date !== 'any' || selectedCategories.length || selectedSeating.length)
  const sectionTitle = 'text-sm font-bold text-slate-900'
  const checkbox = 'size-[18px] rounded border-slate-300 accent-brand-500'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[38px] font-bold leading-tight tracking-tight text-slate-900">{isOrganizer ? t('events.organizerHeading') : t('nav.events')}</h1>
          <p className="mt-1 text-[15px] text-slate-600">{t(visibleEvents.length === 1 ? 'events.matchCountOne' : 'events.matchCount', { count: visibleEvents.length })}</p>
        </div>
        {isOrganizer && <Link to="/events/new" className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-5 text-sm font-bold text-white hover:bg-brand-600">{t('events.create')}</Link>}
      </div>

      <form onSubmit={submitSearch} role="search" className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white py-2 pl-6 pr-2">
        <SearchIcon className="size-5 shrink-0 text-slate-500" />
        <input aria-label={t('events.search')} value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder={t('events.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-slate-500" />
        <button type="submit" className="h-11 rounded-lg bg-brand-500 px-6 text-sm font-bold text-white transition hover:bg-brand-600 sm:px-12">{t('home.search')}</button>
      </form>

      <div className="mt-7 grid items-start gap-8 lg:grid-cols-[300px_1fr]">
        <aside aria-label={t('events.filters')} className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">{t('events.filters')}</h2>
            {hasFilters && <button type="button" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setDraftQuery('') }} className="text-[13px] font-bold text-brand-500 hover:text-brand-700">{t('events.clear')}</button>}
          </div>

          {categories.length > 0 && (
            <fieldset className="mt-5 border-b border-slate-200 pb-5">
              <legend className={sectionTitle}>{t('events.category')}</legend>
              <div className="mt-3 space-y-2.5">
                {categories.map((category) => (
                  <label key={category} className="flex cursor-pointer items-center gap-3 text-[15px] text-slate-800">
                    <input type="checkbox" className={checkbox} checked={selectedCategories.some((c) => c.toLocaleLowerCase() === category.toLocaleLowerCase())} onChange={() => toggle('category', category)} />
                    {category}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="mt-5 border-b border-slate-200 pb-5">
            <legend className={sectionTitle}>{t('events.dateFilter')}</legend>
            <div className="mt-3 space-y-2.5">
              {DATE_RANGES.map((range) => (
                <label key={range} className="flex cursor-pointer items-center gap-3 text-[15px] font-bold text-slate-800">
                  <input type="radio" name="date" className="size-[18px] accent-brand-500" checked={date === range} onChange={() => update((next) => { if (range === 'any') next.delete('date'); else next.set('date', range) })} />
                  {t(`events.date.${range}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 border-b border-slate-200 pb-5">
            <label htmlFor="city-filter" className={sectionTitle}>{t('events.city')}</label>
            <div className="relative mt-3">
              <select id="city-filter" aria-label={t('events.cityFilter')} value={city} onChange={(event) => update((next) => { if (event.target.value) next.set('city', event.target.value); else next.delete('city') })} className="h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3.5 pr-10 text-[15px] text-slate-900 outline-none focus:border-brand-500">
                <option value="">{t('events.allCities')}</option>
                {cities.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className={sectionTitle}>{t('events.seating')}</legend>
            <div className="mt-3 space-y-2.5">
              {(['General', 'Assigned'] as const).map((mode) => (
                <label key={mode} className="flex cursor-pointer items-center gap-3 text-[15px] text-slate-800">
                  <input type="checkbox" className={checkbox} checked={selectedSeating.includes(mode)} onChange={() => toggle('seating', mode)} />
                  {t(mode === 'General' ? 'events.seatingGeneral' : 'events.seatingAssigned')}
                </label>
              ))}
            </div>
          </fieldset>
        </aside>

        <section aria-label={t('events.results')}>
          <p className="mb-4 text-sm font-bold text-slate-800">{t('events.sortedByDate')}</p>
          {actionError && <p role="alert" className="mb-4 text-sm text-rose-700">{actionError}</p>}
          {visibleEvents.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('events.noMatch')}</p>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {pageEvents.map((event) => (
                <li key={event.id}>
                  <EventCard
                    event={event}
                    badge={isOrganizer ? <Badge tone={event.isCancelled ? 'rose' : event.isPublished ? 'green' : 'amber'}>{event.isCancelled ? t('events.cancelled') : event.isPublished ? t('events.published') : t('events.draft')}</Badge> : undefined}
                    footer={isOrganizer ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {!event.isCancelled && <Link to={`/events/${event.id}/manage`} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600">{t('events.manage')}</Link>}
                        {!event.isCancelled && <Link to={`/events/${event.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">{t('events.preview')}</Link>}
                        <button aria-label={t('events.duplicate', { title: event.title })} onClick={() => void duplicate(event.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">{t('events.copy')}</button>
                        {!event.isCancelled && <button onClick={() => setConfirmCancelId(event.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50">{t('events.cancel')}</button>}
                        {confirmCancelId === event.id && (
                          <div className="basis-full rounded-lg bg-rose-50 p-3 text-xs text-rose-900">
                            <p>{t('events.confirmCancelText')}</p>
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => void cancel(event.id)} className="rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white">{t('events.confirmCancel')}</button>
                              <button onClick={() => setConfirmCancelId('')} className="rounded-lg border border-rose-200 px-3 py-1.5 font-semibold">{t('events.keep')}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav aria-label={t('events.pagination')} className="mt-8 flex justify-center gap-2">
              {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  aria-current={number === current ? 'page' : undefined}
                  onClick={() => { const next = new URLSearchParams(params); next.set('page', String(number)); setParams(next); window.scrollTo({ top: 0 }) }}
                  className={`grid size-10 place-items-center rounded-lg text-sm font-bold transition ${number === current ? 'bg-brand-500 text-white' : 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
                >
                  {number}
                </button>
              ))}
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}
