import { useEffect, useState, type FormEvent } from 'react'
import { getTicketTypes, type TicketType } from '../../api/events'
import { configureSeating, getSeatMap, getVenues, type SeatMap as SeatMapData, type Venue } from '../../api/platform'
import { buttonClass, inputClass } from '../../components/form'
import { SeatMap } from '../../components/SeatMap'

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
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load seating.') })
    return () => { active = false }
  }, [eventId, onError])

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
      onMessage(mode === 'Assigned' ? 'Assigned seating saved.' : 'Event switched to general admission.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save seating.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={(form) => void save(form)} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-bold">Seating</h2><p className="mt-1 text-sm text-slate-500">Choose general admission or the predefined venue layout. Seating can only change while no tickets are sold or reserved.</p></div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Mode</legend>
          {(['General', 'Assigned'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} className="accent-indigo-600" />{value === 'General' ? 'General admission' : 'Assigned seating'}</label>
          ))}
        </fieldset>
        {mode === 'Assigned' && (
          <>
            <label className="block text-sm font-medium">Venue layout<select value={venueId} onChange={(event) => setVenueId(event.target.value)} className={`${inputClass} mt-1.5`}>{venues.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.seatCount} seats</option>)}</select></label>
            {venue && <p className="text-xs text-slate-500">{venue.address}</p>}
            {types.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Create ticket types first; each section is sold at the price of its ticket type.</p>}
            {venue?.sections.map((section) => (
              <label key={`${venueId}-${section.id}`} className="block text-sm font-medium">{section.name}
                <span className="ml-2 text-xs font-normal text-slate-500">{section.seatCount} seats · {section.accessibleSeatCount} accessible · rows {section.rows.join(', ')}</span>
                <select name={`section-${section.id}`} defaultValue={map?.sections.find((item) => item.sectionId === section.id)?.ticketTypeId ?? ''} className={`${inputClass} mt-1.5`}>
                  <option value="">Not on sale</option>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
            ))}
          </>
        )}
        <button disabled={busy} className={`${buttonClass} w-full`}>{busy ? 'Saving…' : 'Save seating'}</button>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Seat map preview</h2>
        {map?.seatingMode === 'Assigned'
          ? <div className="mt-4"><SeatMap map={map} selected={[]} limit={0} onToggle={() => undefined} /></div>
          : <p className="mt-4 text-sm text-slate-500">This event uses general admission, so attendees choose a ticket quantity instead of a seat.</p>}
      </section>
    </div>
  )
}
