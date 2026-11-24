import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyOrders } from '../api/events'
import { createSupportCase, getNotifications, getSupportCases } from '../api/workflows'
import { AuthProvider } from '../lib/auth'
import { saveSession } from '../lib/storage'
import Support from './Support'

vi.mock('../api/workflows', () => ({
  addSupportMessage: vi.fn(),
  createSupportCase: vi.fn(),
  getNotifications: vi.fn(),
  getSupportCases: vi.fn(),
  markNotificationRead: vi.fn(),
  updateSupportCase: vi.fn(),
}))

vi.mock('../api/events', () => ({
  getEvents: vi.fn(),
  getMyOrders: vi.fn(),
}))

vi.mock('../api/platform', () => ({
  escalateSupportCase: vi.fn(),
}))

const order = {
  id: 'order-1234567',
  eventId: 'event-1',
  eventTitle: 'Summer music night',
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
}

function renderPage(path: string) {
  saveSession('test-token', '2099-01-01T00:00:00.000Z', {
    id: 'attendee-1',
    email: 'attendee@example.com',
    role: 'Attendee',
    emailConfirmed: true,
  })
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/support" element={<Support />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('Support request form', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getSupportCases).mockResolvedValue([])
    vi.mocked(getNotifications).mockResolvedValue([])
    vi.mocked(getMyOrders).mockResolvedValue([order])
    vi.mocked(createSupportCase).mockReset()
    vi.mocked(createSupportCase).mockRejectedValue(new Error('stop after the request'))
  })

  it('sends the chosen event and order so the organizer receives the request', async () => {
    const user = userEvent.setup()
    renderPage('/support?new=1')

    await screen.findByRole('option', { name: 'Summer music night' })
    await user.selectOptions(screen.getByLabelText(/Related event/), 'event-1')
    await user.selectOptions(screen.getByLabelText(/Related order/), 'order-1234567')
    await user.type(screen.getByLabelText('Subject'), 'Lost ticket')
    await user.type(screen.getByLabelText('Message'), 'I cannot find my ticket.')
    await user.click(screen.getByRole('button', { name: 'Submit request' }))

    await waitFor(() => expect(createSupportCase).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-1',
      orderId: 'order-1234567',
    })))
  })

  it('leaves the event empty for a general question to platform support', async () => {
    const user = userEvent.setup()
    renderPage('/support?new=1')

    await screen.findByRole('option', { name: 'Summer music night' })
    await user.type(screen.getByLabelText('Subject'), 'Account question')
    await user.type(screen.getByLabelText('Message'), 'How do I change my email?')
    await user.click(screen.getByRole('button', { name: 'Submit request' }))

    await waitFor(() => expect(createSupportCase).toHaveBeenCalledWith(expect.objectContaining({ eventId: undefined, orderId: undefined })))
  })

  it('keeps the context from an event page instead of asking for it', async () => {
    renderPage('/support?new=1&eventId=event-1')

    expect(await screen.findByText(/related event reference/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Related event/)).not.toBeInTheDocument()
  })
})
