import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, beforeEach } from 'vitest'
import { AuthProvider } from './auth'
import { RequireAuth } from './RequireAuth'
import { saveSession, type Role } from './storage'

function renderProtectedRoute(role?: Role) {
  localStorage.clear()
  if (role) {
    saveSession('test-token', '2099-01-01T00:00:00.000Z', {
      id: 'user-1',
      email: 'user@example.com',
      role,
      emailConfirmed: true,
    })
  }

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/events/new']}>
        <Routes>
          <Route
            path="/events/new"
            element={
              <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                <h1>Event editor</h1>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<h1>Sign in</h1>} />
          <Route path="/events" element={<h1>Events</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => localStorage.clear())

  it('redirects unauthenticated users to sign in', () => {
    renderProtectedRoute()

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('redirects attendees away from organizer routes', () => {
    renderProtectedRoute('Attendee')

    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument()
  })

  it('allows organizers to open organizer routes', () => {
    renderProtectedRoute('Organizer')

    expect(screen.getByRole('heading', { name: 'Event editor' })).toBeInTheDocument()
  })
})