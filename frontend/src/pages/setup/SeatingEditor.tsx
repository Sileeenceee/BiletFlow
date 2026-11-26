import { useEffect, useState } from 'react'
import type { TicketType } from '../../api/events'
import { configureSeating, getSeatMap, getVenues, type SeatMap as SeatMapData, type Venue } from '../../api/platform'
import { Badge } from '../../components/EventCard'
import { formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

/**
 * General admission or assigned seating on a predefined venue layout (SRS 4.3.1, design 4.3).
 * Each venue section is priced by linking it to one ticket type; unlinked sections are not on sale.
 */
export function SeatingEditor({ eventId, types }: { eventId: string; types: TicketType[] }) {
  const { t } = useLocale()
  const [venues, setVenues] = useState<Venue[]>([])
  const [map, setMap] = useState<SeatMapData | null>(null)
  const [mode, setMode] = useState<'General' | 'Assigned'>('General')
  const [venueId, setVenueId] = useState('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([getVenues(), getSeatMap(eventId)])
      .then(([venueRows, seatMap]) => {
        if (!active) return
        setVenues(venueRows)
        setMap(seatMap)
        setMode(seatMap.seatingMode)
        setVenueId(seatMap.venueId ?? venueRows[0]?.id ?? '')
        setLinks(Object.fromEntries(seatMap.sections.filter((section) => section.ticketTypeId).map((section) => [section.sectionId, section.ticketTypeId!])))
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('seating.loadError')) })
    return () => { active = false }
  }, [eventId, t])

  const venue = venues.find((item) => item.id === venueId)

  async function save() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const sections = mode === 'Assigned' && venue
        ? venue.sections.map((section) => ({ sectionId: section.id, ticketTypeId: links[section.id] ?? '' })).filter((row) => row.ticketTypeId)
        : []
      setMap(await configureSeating(eventId, { seatingMode: mode, venueId: mode === 'Assigned' ? venueId : null, sections }))
      setMessage(mode === 'Assigned' ? t('seating.savedAssigned') : t('seating.savedGeneral'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('seating.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const saved = map && map.seatingMode === mode && (mode === 'General' || map.venueId === venueId)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7" aria-label={t('seating.title')}>
      <h2 className="font-display text-[23px] font-bold text-slate-900">{t('seating.title')}</h2>
      <fieldset className="mt-5 grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">{t('seating.mode')}</legend>
        {(['General', 'Assigned'] as const).map((value) => (
          <label key={value} className="flex cursor-pointer gap-3">
            <input type="radio" name="seating-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1 size-[18px] accent-brand-500" />
            <span><span className="block font-bold text-slate-900">{value === 'General' ? t('seating.general') : t('seating.assigned')}</span><span className="block text-[13px] text-slate-600">{t(value === 'General' ? 'setup.generalHint' : 'setup.assignedHint')}</span></span>
          </label>
        ))}
      </fieldset>

      {mode === 'Assigned' && (
        <>
          <h3 className="mt-7 text-[15px] font-bold text-slate-900">{t('seating.layout')}</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {venues.map((item) => (
              <button key={item.id} type="button" aria-pressed={venueId === item.id} onClick={() => setVenueId(item.id)} className={`flex items-center gap-5 rounded-xl p-5 text-left transition ${venueId === item.id ? 'border-2 border-brand-500 bg-[#EEF3FE]' : 'border border-slate-200 bg-white hover:border-slate-300'}`}>
                <span aria-hidden="true" className="grid shrink-0 gap-1 rounded-lg bg-white p-3">
                  <span className="mb-1 h-1.5 w-full rounded-full bg-slate-300" />
                  {[0, 1, 2, 3].map((row) => <span key={row} className="flex gap-1">{[0, 1, 2, 3, 4, 5].map((seat) => <span key={seat} className="size-2 rounded-sm bg-brand-500" />)}</span>)}
                </span>
                <span>
                  <span className="block font-bold text-slate-900">{item.name}</span>
                  <span className="block text-[13px] text-slate-600">{t('setup.venueInfo', { seats: item.seatCount, sections: item.sections.length })}</span>
                  {venueId === item.id && <span className="mt-2 inline-block"><Badge tone="cyan">{t('setup.selected')}</Badge></span>}
                </span>
              </button>
            ))}
            <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 bg-[#F6F8FB] p-5 text-sm text-slate-500">{t('setup.moreLayouts')}</div>
          </div>

          {venue && (
            <>
              <h3 className="mt-7 text-[15px] font-bold text-slate-900">{t('setup.matchSections')}</h3>
              {types.length === 0 && <p className="mt-2 rounded-xl bg-[#FEF3C7] p-3 text-sm text-[#92400E]">{t('seating.needTypes')}</p>}
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[560px] text-left text-[15px]">
                  <thead className="bg-[#F1F5F9] text-sm text-slate-700"><tr><th className="px-4 py-3 font-bold">{t('setup.section')}</th><th className="px-4 py-3 font-bold">{t('setup.rows')}</th><th className="px-4 py-3 font-bold">{t('setup.ticketType')}</th><th className="px-4 py-3 font-bold">{t('manageEvent.price')}</th></tr></thead>
                  <tbody className="divide-y divide-slate-200">
                    {venue.sections.map((section) => {
                      const linked = types.find((type) => type.id === links[section.id])
                      return (
                        <tr key={section.id}>
                          <td className="px-4 py-3"><span className="font-bold text-slate-900">{section.name}</span><span className="block text-xs text-slate-500">{t('setup.sectionSeats', { seats: section.seatCount, accessible: section.accessibleSeatCount })}</span></td>
                          <td className="px-4 py-3 text-slate-600">{section.rows.length > 2 ? `${section.rows[0]}–${section.rows[section.rows.length - 1]}` : section.rows.join(', ')}</td>
                          <td className="px-4 py-3">
                            <select aria-label={t('setup.ticketTypeFor', { section: section.name })} value={links[section.id] ?? ''} onChange={(event) => setLinks((current) => ({ ...current, [section.id]: event.target.value }))} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
                              <option value="">{t('seatMap.notOnSale')}</option>
                              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-slate-800">{linked ? (linked.price ? formatKzt(linked.price) : t('event.free')) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[13px] text-slate-500">{t('setup.layoutNote')}</p>
            </>
          )}
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save()} className="h-11 rounded-lg bg-brand-500 px-6 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('common.saving') : t('seating.save')}</button>
        {message && <span role="status" className="text-sm font-bold text-[#15803D]">{message}</span>}
        {!message && saved === false && <span className="text-sm text-slate-500">{t('setup.unsavedSeating')}</span>}
        {error && <span role="alert" className="text-sm text-rose-700">{error}</span>}
      </div>
    </section>
  )
}
