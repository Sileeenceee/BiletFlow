import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { cancelEvent, duplicateEvent, getEvents, type EventSummary } from '../api/events'
import { useAuth } from '../lib/auth'
import { formatDateTime } from '../lib/format'
import { useLocale } from '../lib/i18n'

export default function Events() {
  const { user } = useAuth()
  const { t } = useLocale()
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const [events, setEvents] = useState<EventSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmCancelId, setConfirmCancelId] = useState('')

  useEffect(() => {
    // Guards against setting state after the component unmounts.
    let cancelled = false

    getEvents(user?.role === 'Organizer')
      .then((data) => {
        if (!cancelled) setEvents(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('events.loadError'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [t, user?.role])

  const visibleEvents = useMemo(() => events.filter((event) => {
    const matchesQuery = `${event.title} ${event.description} ${event.category ?? ''}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
    return matchesQuery && (!city || event.city.toLocaleLowerCase() === city.toLocaleLowerCase())
  }), [city, events, query])

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

  if (loading) return <p>{t('events.loading')}</p>

  if (error) {
    return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</p>
  }

  const cities = [...new Set(events.map((event) => event.city).filter(Boolean))].sort()

  if (events.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-indigo-50 text-2xl">✦</div>
        <h1 className="text-2xl font-bold tracking-tight">{isOrganizer ? t('events.emptyOrganizerTitle') : t('events.emptyTitle')}</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-500">{isOrganizer ? t('events.emptyOrganizerText') : t('events.emptyText')}</p>
        {isOrganizer && (
          <Link to="/events/new" className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
            {t('events.createFirst')}
          </Link>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-6 py-10 text-white shadow-xl shadow-indigo-950/10 sm:px-10 sm:py-14">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">{t('events.heroKicker')}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{isOrganizer ? t('events.heroOrganizerTitle') : t('events.heroTitle')}</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-indigo-100">{isOrganizer ? t('events.heroOrganizerText') : t('events.heroText')}</p>
          {isOrganizer && <Link to="/events/new" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-800 transition hover:bg-indigo-50">{t('events.create')} <span className="ml-2">↗</span></Link>}
        </div>
        <div aria-hidden="true" className="absolute -right-12 -top-20 size-80 rounded-full border-[48px] border-white/10" />
        <div aria-hidden="true" className="absolute -bottom-36 right-44 size-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-600">{isOrganizer ? t('events.organizerKicker') : t('events.kicker')}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{isOrganizer ? t('events.organizerHeading') : t('events.heading')}</h2>
          </div>
          <span className="text-sm text-slate-500">{t(visibleEvents.length === 1 ? 'events.countOne' : 'events.count', { count: visibleEvents.length })}</span>
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_220px]">
          <input aria-label={t('events.search')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('events.searchPlaceholder')} className="rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:bg-white" />
          <select aria-label={t('events.cityFilter')} value={city} onChange={(event) => setCity(event.target.value)} className="rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:bg-white">
            <option value="">{t('events.allCities')}</option>
            {cities.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}
        {visibleEvents.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('events.noMatch')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleEvents.map((event) => (
              <li key={event.id} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-indigo-100 via-violet-100 to-amber-100">
                  {event.imageUrls?.[0] ? <img src={event.imageUrls[0]} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid size-full place-items-center text-5xl text-indigo-300">✦</div>}
                  {isOrganizer && <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${event.isCancelled ? 'bg-white/90 text-rose-700' : event.isPublished ? 'bg-white/90 text-emerald-700' : 'bg-white/90 text-amber-700'}`}>{event.isCancelled ? t('events.cancelled') : event.isPublished ? t('events.published') : t('events.draft')}</span>}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{event.category || event.city}</p>
                  <h3 className="mt-2 text-lg font-bold leading-snug text-slate-900">{event.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{event.description}</p>
                  <p className="mt-4 text-sm font-semibold text-slate-700">{formatDateTime(event.startDateUtc)}</p>
                  <p className="mt-1 text-sm text-slate-500">{event.venue}{event.city ? ` · ${event.city}` : ''}</p>
                  <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4">
                    {(!isOrganizer || !event.isCancelled) && <Link to={`/events/${event.id}`} className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-indigo-700">{isOrganizer ? t('events.preview') : t('events.view')}</Link>}
                    {isOrganizer && !event.isCancelled && <Link to={`/events/${event.id}/manage`} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('events.manage')}</Link>}
                    {isOrganizer && <button aria-label={t('events.duplicate', { title: event.title })} onClick={() => void duplicate(event.id)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('events.copy')}</button>}
                    {isOrganizer && !event.isCancelled && <button onClick={() => setConfirmCancelId(event.id)} className="rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t('events.cancel')}</button>}
                    {confirmCancelId === event.id && <div className="basis-full rounded-xl bg-rose-50 p-3 text-xs text-rose-900"><p>{t('events.confirmCancelText')}</p><div className="mt-2 flex gap-2"><button onClick={() => void cancel(event.id)} className="rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white">{t('events.confirmCancel')}</button><button onClick={() => setConfirmCancelId('')} className="rounded-lg border border-rose-200 px-3 py-1.5 font-semibold">{t('events.keep')}</button></div></div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
