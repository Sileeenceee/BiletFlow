import { useEffect, useState, type FormEvent } from 'react'
import { getTicketTypes, type TicketType } from '../../api/events'
import { configureSeating, getSeatMap, getVenues, type SeatMap as SeatMapData, type Venue } from '../../api/platform'
import { buttonClass, inputClass } from '../../components/form'
import { SeatMap } from '../../components/SeatMap'
import { useLocale } from '../../lib/i18n'

/**
 * General admission or assigned seating on the predefined venue layout (SRS 4.3.1).
 * Each venue section is priced by linking it to one ticket type; unlinked sections are not on sale.
 */
export function SeatingTab({ eventId, onError, onMessage }: {
  eventId: string
  onError: (value: string) => void
  onMessage: (value: string) => void
}) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [types, setTypes] = useState<TicketType[]>([])
  const [map, setMap] = useState<SeatMapData | null>(null)
  const [mode, setMode] = useState<'General' | 'Assigned'>('General')
  const [venueId, setVenueId] = useState('')
  const [busy, setBusy] = useState(false)
  const { t } = useLocale()

  useEffect(() => {
    let active = true
    Promise.all([getVenues(), getTicketTypes(eventId), getSeatMap(eventId)])
      .then(([venueRows, typeRows, seatMap]) => {
        if (!active) return
        setVenues(venueRows)
        setTypes(typeRows)
        setMap(seatMap)
        setMode(seatMap.seatingMode)
        setVenueId(seatMap.venueId ?? venueRows[0]?.id ?? '')
      })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('seating.loadError')) })
    return () => { active = false }
  }, [eventId, onError, t])

  const venue = venues.find((item) => item.id === venueId)

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    onError('')
    onMessage('')
    setBusy(true)
    try {
      const sections = mode === 'Assigned' && venue
        ? venue.sections
          .map((section) => ({ sectionId: section.id, ticketTypeId: String(data.get(`section-${section.id}`) ?? '') }))
          .filter((row) => row.ticketTypeId)
        : []
      setMap(await configureSeating(eventId, { seatingMode: mode, venueId: mode === 'Assigned' ? venueId : null, sections }))
      onMessage(mode === 'Assigned' ? t('seating.savedAssigned') : t('seating.savedGeneral'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('seating.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={(form) => void save(form)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">{t('seating.title')}</h2><p className="mt-1 text-sm text-slate-500">{t('seating.text')}</p></div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('seating.mode')}</legend>
          {(['General', 'Assigned'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} className="accent-indigo-600" />{value === 'General' ? t('seating.general') : t('seating.assigned')}</label>
          ))}
        </fieldset>
        {mode === 'Assigned' && (
          <>
            <label className="block text-sm font-medium">{t('seating.layout')}<select value={venueId} onChange={(event) => setVenueId(event.target.value)} className={`${inputClass} mt-1.5`}>{venues.map((item) => <option key={item.id} value={item.id}>{t('seating.venueOption', { name: item.name, count: item.seatCount })}</option>)}</select></label>
            {venue && <p className="text-xs text-slate-500">{venue.address}</p>}
            {types.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{t('seating.needTypes')}</p>}
            {venue?.sections.map((section) => (
              <label key={`${venueId}-${section.id}`} className="block text-sm font-medium">{section.name}
                <span className="ml-2 text-xs font-normal text-slate-500">{t('seating.sectionInfo', { seats: section.seatCount, accessible: section.accessibleSeatCount, rows: section.rows.join(', ') })}</span>
                <select name={`section-${section.id}`} defaultValue={map?.sections.find((item) => item.sectionId === section.id)?.ticketTypeId ?? ''} className={`${inputClass} mt-1.5`}>
                  <option value="">{t('seatMap.notOnSale')}</option>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
            ))}
          </>
        )}
        <button disabled={busy} className={`${buttonClass} w-full`}>{busy ? t('common.saving') : t('seating.save')}</button>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">{t('seating.previewTitle')}</h2>
        {map?.seatingMode === 'Assigned'
          ? <div className="mt-4"><SeatMap map={map} selected={[]} limit={0} onToggle={() => undefined} /></div>
          : <p className="mt-4 text-sm text-slate-500">{t('seating.generalNote')}</p>}
      </section>
    </div>
  )
}
