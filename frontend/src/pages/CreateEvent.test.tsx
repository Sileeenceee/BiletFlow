import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent, getCities } from '../api/events'
import { AuthProvider } from '../lib/auth'
import { saveSession } from '../lib/storage'
import CreateEvent from './CreateEvent'

vi.mock('../api/events', () => ({
  createEvent: vi.fn(),
  getCities: vi.fn(),
}))

function renderCreateEvent() {
  saveSession('test-token', '2099-01-01T00:00:00.000Z', {
    id: 'organizer-1',
    email: 'organizer@example.com',
    role: 'Organizer',
    emailConfirmed: true,
  })

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/events/new']}>
        <Routes>
          <Route path="/events/new" element={<CreateEvent />} />
          <Route path="/events" element={<h1>Events</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('CreateEvent', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(createEvent).mockReset()
    vi.mocked(getCities).mockReset()
    vi.mocked(getCities).mockResolvedValue([
      { id: 1, name: 'Almaty' },
      { id: 2, name: 'Astana' },
    ])
  })

  it('rejects an end time before the start time without calling the API', async () => {
    const user = userEvent.setup()
    renderCreateEvent()

    await user.type(screen.getByLabelText('Title'), 'A valid event title')
    await user.type(screen.getByLabelText('Description'), 'A sufficiently long event description.')
    await user.type(screen.getByLabelText('Name'), 'Main Hall')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'City' }), 'Almaty')
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2030-06-01T18:00' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2030-06-01T17:00' } })
    await user.click(screen.getByRole('button', { name: 'Create event' }))

    expect(await screen.findByText('End must be after start')).toBeInTheDocument()
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('normalizes valid event data and navigates after creation', async () => {
    const user = userEvent.setup()
    vi.mocked(createEvent).mockResolvedValue({
      id: 'event-1',
      title: 'A valid event title',
      description: 'A sufficiently long event description.',
      venue: 'Main Hall',
      city: 'Almaty',
      cityId: 1,
      startDateUtc: '2030-06-01T18:00:00.000Z',
      endDateUtc: '2030-06-01T21:00:00.000Z',
      isPublished: false,
    })
    renderCreateEvent()

    await user.type(screen.getByLabelText('Title'), 'A valid event title')
    await user.type(screen.getByLabelText('Description'), 'A sufficiently long event description.')
    await user.type(screen.getByLabelText('Name'), 'Main Hall')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'City' }), 'Almaty')
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2030-06-01T18:00' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2030-06-01T21:00' } })
    await user.click(screen.getByRole('button', { name: 'Create event' }))

    expect(createEvent).toHaveBeenCalledWith({
      title: 'A valid event title',
      description: 'A sufficiently long event description.',
      venue: 'Main Hall',
      cityId: 1,
      startDateUtc: new Date('2030-06-01T18:00').toISOString(),
      endDateUtc: new Date('2030-06-01T21:00').toISOString(),
      isPublished: false,
    })
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument()
  })

  it('requires a city to be chosen without calling the API', async () => {
    const user = userEvent.setup()
    renderCreateEvent()

    await user.type(screen.getByLabelText('Title'), 'A valid event title')
    await user.type(screen.getByLabelText('Description'), 'A sufficiently long event description.')
    await user.type(screen.getByLabelText('Name'), 'Main Hall')
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2030-06-01T18:00' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2030-06-01T21:00' } })
    expect(await screen.findByRole('option', { name: 'Almaty' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create event' }))

    expect(await screen.findByText('Choose a city', { selector: '[role="alert"]' })).toBeInTheDocument()
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('shows an error and blocks saving when the city list fails to load', async () => {
    vi.mocked(getCities).mockRejectedValue(new Error('Network error'))
    renderCreateEvent()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the city list: Network error')
    expect(screen.queryByRole('combobox', { name: 'City' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create event' })).toBeDisabled()
  })
})
