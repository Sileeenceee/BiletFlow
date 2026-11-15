import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SeatMap as SeatMapData } from '../api/platform'
import { SeatMap } from './SeatMap'

const map: SeatMapData = {
  eventId: 'event-1',
  seatingMode: 'Assigned',
  venueId: 'venue-1',
  venueName: 'Demo Hall',
  holdMinutes: 15,
  legend: { Available: 'Available — can be selected', Sold: 'Sold — no longer available' },
  sections: [{
    sectionId: 'section-1',
    name: 'Parterre',
    ticketTypeId: 'type-1',
    ticketTypeName: 'Standard',
    price: 5000,
    seats: [
      { seatId: 'a1', rowLabel: 'A', number: '1', isAccessible: false, status: 'Available', label: 'Parterre, Row A, Seat 1: Available, 5000 KZT' },
      { seatId: 'a2', rowLabel: 'A', number: '2', isAccessible: true, status: 'Available', label: 'Parterre, Row A, Seat 2: Available, 5000 KZT' },
      { seatId: 'a3', rowLabel: 'A', number: '3', isAccessible: false, status: 'Sold', label: 'Parterre, Row A, Seat 3: Available, 5000 KZT' },
    ],
  }],
}

describe('SeatMap', () => {
  it('describes every seat with text, not colour alone', () => {
    render(<SeatMap map={map} selected={['a1']} limit={10} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Parterre, row A, seat 1, selected' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Parterre, row A, seat 2, accessible, available' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parterre, row A, seat 3, sold' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('lets an available seat be chosen by mouse or keyboard but not a sold one', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<SeatMap map={map} selected={[]} limit={10} onToggle={onToggle} />)

    await user.click(screen.getByRole('button', { name: /seat 1, available/ }))
    screen.getByRole('button', { name: /seat 2, accessible, available/ }).focus()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: /seat 3, sold/ }))

    expect(onToggle.mock.calls.map(([seat]) => seat.seatId)).toEqual(['a1', 'a2'])
  })

  it('stops further selection once the order limit is reached', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<SeatMap map={map} selected={['a1']} limit={1} onToggle={onToggle} />)

    await user.click(screen.getByRole('button', { name: /seat 2/ }))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
