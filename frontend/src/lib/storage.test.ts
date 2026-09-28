import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, getStoredUser, getToken, saveSession } from './storage'

describe('session storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns the stored session while it is valid', () => {
    saveSession('test-token', '2099-01-01T00:00:00.000Z', {
      id: 'user-1',
      email: 'user@example.com',
      role: 'Attendee',
      emailConfirmed: true,
    })

    expect(getToken()).toBe('test-token')
    expect(getStoredUser()).toMatchObject({ id: 'user-1', role: 'Attendee' })
  })

  it('removes expired sessions before returning them', () => {
    saveSession('expired-token', '2000-01-01T00:00:00.000Z', {
      id: 'user-1',
      email: 'user@example.com',
      role: 'Attendee',
      emailConfirmed: true,
    })

    expect(getToken()).toBeNull()
    expect(getStoredUser()).toBeNull()
    expect(localStorage.getItem('biletflow.session')).toBeNull()
  })

  it('removes malformed session JSON', () => {
    localStorage.setItem('biletflow.session', '{not-json')

    expect(getToken()).toBeNull()
    expect(localStorage.getItem('biletflow.session')).toBeNull()
  })

  it('clears a valid session explicitly', () => {
    saveSession('test-token', '2099-01-01T00:00:00.000Z', {
      id: 'user-1',
      email: 'user@example.com',
      role: 'Attendee',
      emailConfirmed: true,
    })

    clearSession()

    expect(getToken()).toBeNull()
  })
})