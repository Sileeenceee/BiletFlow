import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './client'
import { getToken, saveSession } from '../lib/storage'

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds JSON and bearer headers and returns a successful response', async () => {
    saveSession('test-token', '2099-01-01T00:00:00.000Z', {
      id: 'user-1',
      email: 'attendee@example.com',
      role: 'Attendee',
      emailConfirmed: true,
    })
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok' }), { status: 200 }),
    )

    await expect(apiFetch<{ message: string }>('/api/example')).resolves.toEqual({ message: 'ok' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/example',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })

  it('surfaces API validation messages as ApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'A valid email is required.' }), { status: 400 }),
    )

    await expect(apiFetch('/api/auth/register')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'A valid email is required.',
    })
  })

  it('does not clear a session for a public endpoint returning 401', async () => {
    saveSession('still-valid', '2099-01-01T00:00:00.000Z', {
      id: 'user-1',
      email: 'attendee@example.com',
      role: 'Attendee',
      emailConfirmed: true,
    })
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))

    await expect(
      apiFetch('/api/auth/login', { method: 'POST', redirectOnUnauthorized: false }),
    ).rejects.toEqual(new ApiError(401, 'Invalid email or password'))
    expect(getToken()).toBe('still-valid')
  })
})