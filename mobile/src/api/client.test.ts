import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, getRefreshToken, getServer, getStoredUser, getToken, saveSession } from '../lib/storage'
import { checkInTicket, validateTicket } from './checkin'
import { apiBytes, apiFetch } from './client'

vi.mock('../lib/storage', () => ({
  clearSession: vi.fn(),
  getRefreshToken: vi.fn(),
  getServer: vi.fn(),
  getStoredUser: vi.fn(),
  getToken: vi.fn(),
  saveSession: vi.fn(),
}))

const server = 'http://test-server.example'
const staff = { id: 'staff-1', email: 'staff@example.test', role: 'EventAdmin', emailConfirmed: true } as const

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(getServer).mockReturnValue(server)
  vi.mocked(getToken).mockReturnValue('staff-access')
  vi.mocked(getRefreshToken).mockReturnValue('staff-refresh')
  vi.mocked(getStoredUser).mockReturnValue(staff)
})

afterEach(() => vi.unstubAllGlobals())

describe('mobile API', () => {
  it.each([
    { send: validateTicket, path: 'validate', status: 400, result: 'Invalid' },
    { send: validateTicket, path: 'validate', status: 200, result: 'Valid' },
    { send: checkInTicket, path: 'check-in', status: 409, result: 'AlreadyUsed' },
    { send: checkInTicket, path: 'check-in', status: 200, result: 'CheckedIn' },
  ])('returns the scanner result $result for HTTP $status', async ({ send, path, status, result }) => {
    const body = { result, message: 'Result from the API', seatLabel: 'A-12' }
    vi.mocked(fetch).mockResolvedValue(Response.json(body, { status }))

    await expect(send('event-1', 'TKT_example')).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledWith(`${server}/api/verification/${path}`, {
      method: 'POST',
      body: JSON.stringify({ ticketCode: 'TKT_example', eventId: 'event-1' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer staff-access' },
    })
  })

  it('shares one token rotation between JSON requests and ticket downloads', async () => {
    const expiresAt = '2099-01-01T00:00:00.000Z'
    const pdf = new TextEncoder().encode('%PDF-1.7')
    vi.mocked(saveSession).mockImplementation((token) => {
      vi.mocked(getToken).mockReturnValue(token)
    })
    const fetchMock = vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === `${server}/api/auth/refresh`) {
        return Response.json({
          accessToken: 'fresh-access', refreshToken: 'fresh-refresh', expiresAt,
          userId: staff.id, email: staff.email, role: staff.role, emailConfirmed: staff.emailConfirmed,
        })
      }
      if (new Headers(init?.headers).get('Authorization') !== 'Bearer fresh-access') {
        return new Response(null, { status: 401 })
      }
      return url === `${server}/api/tickets/ticket-1/pdf` ? new Response(pdf) : Response.json([])
    })

    const [orders, download] = await Promise.all([apiFetch('/api/orders/me'), apiBytes('/api/tickets/ticket-1/pdf')])
    expect(orders).toEqual([])
    expect(new Uint8Array(download)).toEqual(pdf)
    expect(fetchMock.mock.calls.filter(([url]) => url === `${server}/api/auth/refresh`)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(saveSession).toHaveBeenCalledExactlyOnceWith('fresh-access', expiresAt, staff, 'fresh-refresh')
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('clears an expired session when refresh is rejected', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(null, { status: 401 }))

    await expect(apiFetch('/api/orders/me')).rejects.toMatchObject({ name: 'ApiError', status: 401 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(clearSession).toHaveBeenCalledTimes(1)
  })

  it('preserves an active session when public sign-in rejects credentials', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }))

    await expect(apiFetch('/api/auth/login', { method: 'POST', redirectOnUnauthorized: false }))
      .rejects.toMatchObject({ status: 401, message: 'Invalid email or password' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('reports the selected server when a network request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'))

    await expect(apiFetch('/api/events')).rejects.toMatchObject({
      name: 'ApiError', status: 0, message: expect.stringContaining(server),
    })
  })
})
