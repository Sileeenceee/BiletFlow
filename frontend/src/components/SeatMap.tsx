import type { KeyboardEvent } from 'react'
import { seatLabel, type Seat, type SeatMap as SeatMapData } from '../api/platform'
import { formatKzt } from '../lib/format'

type SeatState = Seat['status'] | 'Selected'

// Every state pairs a colour with a symbol so the map never relies on colour alone (SRS 4.3.1).
const styles: Record<SeatState, { fill: string; stroke: string; text: string; symbol: string }> = {
  Available: { fill: '#ffffff', stroke: '#059669', text: '#047857', symbol: '' },
  Selected: { fill: '#4f46e5', stroke: '#3730a3', text: '#ffffff', symbol: '✓' },
  Held: { fill: '#fef3c7', stroke: '#d97706', text: '#92400e', symbol: 'H' },
  Sold: { fill: '#cbd5e1', stroke: '#64748b', text: '#334155', symbol: '×' },
  Unavailable: { fill: '#f1f5f9', stroke: '#cbd5e1', text: '#94a3b8', symbol: '–' },
}

const SIZE = 30
const GAP = 6
const LABEL = 34

type Props = {
  map: SeatMapData
  selected: string[]
  /** Maximum number of seats in one order. */
  limit: number
  onToggle: (seat: Seat) => void
}

export function SeatMap({ map, selected, limit, onToggle }: Props) {
  return (
    <div className="space-y-5">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600" aria-label="Seat map legend">
        {(['Available', 'Selected', 'Held', 'Sold', 'Unavailable'] as SeatState[]).map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <svg width="18" height="18" aria-hidden="true">
              <rect x="1" y="1" width="16" height="16" rx="4" fill={styles[state].fill} stroke={styles[state].stroke} strokeWidth="1.5" />
              <text x="9" y="13" textAnchor="middle" fontSize="10" fontWeight="700" fill={styles[state].text}>{styles[state].symbol}</text>
            </svg>
            {state === 'Selected' ? 'Selected — your choice' : map.legend[state] ?? state}
          </li>
        ))}
        <li className="flex items-center gap-1.5"><span aria-hidden="true">♿</span>Accessible seat</li>
      </ul>

      {map.sections.map((section) => {
        const rows = [...new Set(section.seats.map((seat) => seat.rowLabel))]
        const widest = Math.max(...rows.map((row) => section.seats.filter((seat) => seat.rowLabel === row).length), 1)
        const width = LABEL + widest * (SIZE + GAP)
        const height = rows.length * (SIZE + GAP)
        return (
          <section key={section.sectionId} aria-label={`Section ${section.name}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">{section.name}</h3>
              <p className="text-xs text-slate-500">
                {section.ticketTypeName
                  ? `${section.ticketTypeName} · ${section.price ? formatKzt(section.price) : 'Free'}`
                  : 'Not on sale'}
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl bg-slate-50 p-3">
              <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="group" aria-label={`${section.name} seats`}>
                {rows.map((row, rowIndex) => (
                  <g key={row} transform={`translate(0 ${rowIndex * (SIZE + GAP)})`}>
                    <text x={LABEL - 12} y={SIZE / 2 + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="#64748b">{row}</text>
                    {section.seats.filter((seat) => seat.rowLabel === row).map((seat, seatIndex) => {
                      const isSelected = selected.includes(seat.seatId)
                      const state: SeatState = isSelected ? 'Selected' : seat.status
                      const selectable = isSelected || (seat.status === 'Available' && selected.length < limit)
                      const style = styles[state]
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
                          aria-label={`${seatLabel(section.name, seat)}${seat.isAccessible ? ', accessible' : ''}, ${state.toLowerCase()}`}
                          onClick={toggle}
                          onKeyDown={onKey}
                          style={{ cursor: selectable ? 'pointer' : 'not-allowed', outlineOffset: 2 }}
                        >
                          <rect width={SIZE} height={SIZE} rx="7" fill={style.fill} stroke={style.stroke} strokeWidth={seat.isAccessible ? 2.5 : 1.5} strokeDasharray={seat.isAccessible ? '4 2' : undefined} />
                          <text x={SIZE / 2} y={SIZE / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={style.text} pointerEvents="none">
                            {style.symbol || (seat.isAccessible ? '♿' : seat.number)}
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
  )
}
