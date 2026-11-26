import type { KeyboardEvent } from 'react'
import type { Seat, SeatMap as SeatMapData } from '../api/platform'
import { formatKzt } from '../lib/format'
import { useLocale } from '../lib/i18n'

type SeatState = Seat['status'] | 'Selected'

// Every state pairs a colour with a symbol so the map never relies on colour alone (SRS 4.3.1).
const styles: Record<SeatState, { fill: string; stroke: string; text: string; symbol: string }> = {
  Available: { fill: '#ffffff', stroke: '#4D7AED', text: '#2B4BB5', symbol: '' },
  Selected: { fill: '#4D7AED', stroke: '#2B4BB5', text: '#ffffff', symbol: '✓' },
  Held: { fill: '#FBBF24', stroke: '#B45309', text: '#0F172A', symbol: 'H' },
  Sold: { fill: '#CBD5E1', stroke: '#94A3B8', text: '#334155', symbol: '×' },
  Unavailable: { fill: '#F1F5F9', stroke: '#CBD5E1', text: '#94A3B8', symbol: '–' },
}
const accessible = { fill: '#DCE6FD', stroke: '#2B4BB5', text: '#2B4BB5' }
// Section colour bars, as in the design's price categories.
const sectionColors = ['#F59E0B', '#4D7AED', '#7C3AED', '#059669', '#E11D48', '#0891B2']

const SIZE = 26
const GAP = 4
const LABEL = 30

type Props = {
  map: SeatMapData
  selected: string[]
  /** Maximum number of seats in one order. */
  limit: number
  onToggle: (seat: Seat) => void
}

function KeySwatch({ state, isAccessible = false }: { state: SeatState; isAccessible?: boolean }) {
  const style = isAccessible ? accessible : styles[state]
  return (
    <svg width="28" height="28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="6" fill={style.fill} stroke={style.stroke} strokeWidth="1.5" />
      <text x="14" y="18.5" textAnchor="middle" fontSize="12" fontWeight="700" fill={style.text}>{isAccessible ? 'A' : styles[state].symbol}</text>
    </svg>
  )
}

export function SeatMap({ map, selected, limit, onToggle }: Props) {
  const { t } = useLocale()
  return (
    <div>
      <div className="mx-auto mb-8 max-w-md rounded-full bg-[#E2E8F0] py-2.5 text-center text-sm font-bold text-slate-600">{t('seatMap.stage')}</div>

      <div className="space-y-8">
        {map.sections.map((section, sectionIndex) => {
          const rows = [...new Set(section.seats.map((seat) => seat.rowLabel))]
          const widest = Math.max(...rows.map((row) => section.seats.filter((seat) => seat.rowLabel === row).length), 1)
          const width = LABEL + widest * (SIZE + GAP)
          const height = rows.length * (SIZE + GAP)
          const color = sectionColors[sectionIndex % sectionColors.length]
          return (
            <section key={section.sectionId} aria-label={t('seatMap.section', { name: section.name })} className={sectionIndex > 0 ? 'border-t border-slate-200 pt-6' : ''}>
              <h3 className="mb-3 text-center text-sm font-bold text-slate-600">{section.name}</h3>
              <div className="overflow-x-auto pb-1">
                <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="mx-auto" role="group" aria-label={t('seatMap.sectionSeats', { name: section.name })}>
                  {rows.map((row, rowIndex) => (
                    <g key={row} transform={`translate(0 ${rowIndex * (SIZE + GAP)})`}>
                      <rect x="0" y="4" width="3" height={SIZE - 8} rx="1.5" fill={color} />
                      <text x={LABEL - 10} y={SIZE / 2 + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="#64748b">{row}</text>
                      {section.seats.filter((seat) => seat.rowLabel === row).map((seat, seatIndex) => {
                        const isSelected = selected.includes(seat.seatId)
                        const state: SeatState = isSelected ? 'Selected' : seat.status
                        const selectable = isSelected || (seat.status === 'Available' && selected.length < limit)
                        const style = seat.isAccessible && state === 'Available' ? accessible : styles[state]
                        const toggle = () => { if (selectable) onToggle(seat) }
                        const onKey = (event: KeyboardEvent) => {
                          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle() }
                        }
                        return (
                          <g
                            key={seat.seatId}
                            transform={`translate(${LABEL + seatIndex * (SIZE + GAP)} 0)`}
                            role="button"
                            tabIndex={selectable ? 0 : -1}
                            aria-pressed={isSelected}
                            aria-disabled={!selectable}
                            aria-label={`${t('seatMap.seat', { section: section.name, row: seat.rowLabel, seat: seat.number })}${seat.isAccessible ? `, ${t('seatMap.accessible')}` : ''}, ${t(`seatMap.state.${state}`)}`}
                            onClick={toggle}
                            onKeyDown={onKey}
                            style={{ cursor: selectable ? 'pointer' : 'not-allowed', outlineOffset: 2 }}
                          >
                            <title>{`${seat.rowLabel}${seat.number}`}</title>
                            <rect x="0.75" y="0.75" width={SIZE - 1.5} height={SIZE - 1.5} rx="6" fill={style.fill} stroke={style.stroke} strokeWidth={1.5} />
                            <text x={SIZE / 2} y={SIZE / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={style.text} pointerEvents="none">
                              {styles[state].symbol || (seat.isAccessible ? 'A' : '')}
                            </text>
                          </g>
                        )
                      })}
                    </g>
                  ))}
                </svg>
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <h3 className="font-display text-[17px] font-bold text-slate-900">{t('seatMap.key')}</h3>
        <ul className="mt-4 grid gap-x-6 gap-y-3 text-[15px] text-slate-700 sm:grid-cols-3" aria-label={t('seatMap.legendLabel')}>
          {(['Available', 'Selected', 'Held', 'Sold', 'Unavailable'] as SeatState[]).map((state) => (
            <li key={state} className="flex items-center gap-3"><KeySwatch state={state} />{t(`seatMap.key.${state}`)}</li>
          ))}
          <li className="flex items-center gap-3"><KeySwatch state="Available" isAccessible />{t('seatMap.accessibleSeat')}</li>
        </ul>

        <h3 className="mt-6 font-display text-[17px] font-bold text-slate-900">{t('seatMap.prices')}</h3>
        <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
          {map.sections.map((section, index) => (
            <li key={section.sectionId} className="flex gap-3">
              <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded" style={{ background: sectionColors[index % sectionColors.length] }} />
              <span>
                <span className="block text-sm font-bold text-slate-900">{section.name}</span>
                <span className="block text-[13px] text-slate-600">
                  {section.ticketTypeName ? `${section.ticketTypeName} · ${section.price ? formatKzt(section.price) : t('event.free')}` : t('seatMap.notOnSale')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
