import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEvents, type EventSummary } from '../api/events'
import { AuthProvider } from '../lib/auth'
import { saveSession } from '../lib/storage'
import Events from './Events'

vi.mock('../api/events', () => ({
  getEvents: vi.fn(),
}))

const publishedEvent: EventSummary = {
  id: 'event-1',
  title: 'Open Air Cinema',
  description: 'An evening screening.',
  venue: 'Central Park',
  city: 'Almaty',
  startDateUtc: '2030-06-01T18:00:00.000Z',
  endDateUtc: '2030-06-01T21:00:00.000Z',
  isPublished: true,
}

function renderEvents() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Events />
      </MemoryRouter>
    </AuthProvider>,
  )
}

function saveUser(role: 'Attendee' | 'Organizer') {
  saveSession('test-token', '2099-01-01T00:00:00.000Z', {
    id: 'user-1',
    email: 'user@example.com',
    role,
    emailConfirmed: true,
  })
}

describe('Events', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getEvents).mockReset()
  })

  it('loads published events for an attendee', async () => {
    saveUser('Attendee')
    vi.mocked(getEvents).mockResolvedValue([publishedEvent])

    renderEvents()

    expect(screen.getByText('Loading events…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Open Air Cinema' })).toBeInTheDocument()
    expect(getEvents).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Published')).not.toBeInTheDocument()
  })

  it('loads organizer events and labels drafts', async () => {
    saveUser('Organizer')
    vi.mocked(getEvents).mockResolvedValue([{ ...publishedEvent, isPublished: false }])

    renderEvents()

    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(getEvents).toHaveBeenCalledWith(true)
  })

  it('shows API errors', async () => {
    saveUser('Attendee')
    vi.mocked(getEvents).mockRejectedValue(new Error('Could not load events'))

    renderEvents()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load events'))
  })
})