import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkout, getEvent, getTicketTypes } from '../api/events'
import { AuthProvider } from '../lib/auth'
import { saveSession } from '../lib/storage'
import EventDetail from './EventDetail'

vi.mock('../api/events', () => ({
  checkout: vi.fn(),
  getEvent: vi.fn(),
  getTicketTypes: vi.fn(),
  payOrder: vi.fn(),
}))

const event = {
  id: 'event-1',
  title: 'Summer music night',
  description: 'Live music under the stars.',
  venue: 'Central Park',
  city: 'Almaty',
  startDateUtc: '2030-06-01T18:00:00.000Z',
  endDateUtc: '2030-06-01T21:00:00.000Z',
  isPublished: true,
  paidSalesStatus: 'Active' as const,
}

const freeTicket = {
  id: 'ticket-1',
  eventId: 'event-1',
  name: 'General admission',
  description: 'Entry to the event',
  price: 0,
  quantity: 100,
  soldQuantity: 0,
  availableQuantity: 100,
  salesStartAt: null,
  salesEndAt: null,
  maxPerOrder: 4,
  isHidden: false,
  reservedQuantity: 0,
  refundedQuantity: 0,
  checkedInQuantity: 0,
}

function renderPage() {
  saveSession('test-token', '2099-01-01T00:00:00.000Z', {
    id: 'attendee-1',
    email: 'attendee@example.com',
    role: 'Attendee',
    emailConfirmed: true,
  })

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/events/event-1']}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetail />} />
          <Route path="/orders" element={<h1>My tickets</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('EventDetail', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getEvent).mockReset()
    vi.mocked(getTicketTypes).mockReset()
    vi.mocked(checkout).mockReset()
    vi.mocked(getEvent).mockResolvedValue(event)
    vi.mocked(getTicketTypes).mockResolvedValue([freeTicket])
  })

  it('reserves a free ticket and shows the confirmed order state', async () => {
    const user = userEvent.setup()
    vi.mocked(checkout).mockResolvedValue({
      id: 'order-1',
      eventId: 'event-1',
      eventTitle: event.title,
      status: 'Confirmed',
      paymentMode: 'Free',
      total: 0,
      createdAt: '2030-01-01T00:00:00.000Z',
      items: [],
      discountTotal: 0,
      feeTotal: 0,
      expiresAt: null,
      paymentStatus: null,
      promoCode: null,
    })
    renderPage()

    await user.selectOptions(await screen.findByLabelText('Quantity for General admission'), '1')
    await user.type(screen.getByLabelText('Attendee name'), 'Test Attendee')
    await user.click(screen.getByRole('button', { name: 'Reserve free tickets' }))

    expect(await screen.findByRole('heading', { name: 'Your tickets are ready!' })).toBeInTheDocument()
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-1',
      attendeeName: 'Test Attendee',
      attendeeEmail: 'attendee@example.com',
      items: [{ ticketTypeId: 'ticket-1', quantity: 1 }],
    }))
  })

  it('does not submit without an available ticket selection', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reserve free tickets' })).toBeDisabled()
    expect(checkout).not.toHaveBeenCalled()
  })
})
