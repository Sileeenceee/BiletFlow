import { clearSession, getRefreshToken, getServer, getStoredUser, getToken, saveSession } from '../lib/storage'

// Same contract as frontend/src/api/client.ts, so the API modules next to this
// file are copies of the website's. Differences: the server address is chosen
// at sign-in, and an expired session notifies the app instead of redirecting.

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type Options = RequestInit & {
  /**
   * Public endpoints (login, register, password reset) answer 401/400 as a
   * normal result, so they must not end the session. Defaults to true.
   */
  redirectOnUnauthorized?: boolean
  /** Non-2xx statuses whose JSON body is still a normal answer (ticket verification results). */
  accept?: number[]
}

export async function apiFetch<T>(path: string, options: Options = {}): Promise<T> {
  const { redirectOnUnauthorized = true, accept = [], ...init } = options
  let res = await send(path, init)
  if (res.status === 401 && redirectOnUnauthorized && (await refreshSession())) res = await send(path, init)

  if (!accept.includes(res.status)) await assertSuccess(res, redirectOnUnauthorized, path)

  return (await readBody<T>(res)) as T
}

/** Raw response body for file downloads (PDF tickets, QR images, .ics, CSV), with the same session handling. */
export async function apiBytes(path: string): Promise<ArrayBuffer> {
  let res = await send(path)
  if (res.status === 401 && (await refreshSession())) res = await send(path)
  await assertSuccess(res, true, path)
  return res.arrayBuffer()
}

let refreshing: Promise<boolean> | null = null

/**
 * Exchanges the stored refresh token for a new access/refresh pair. The API
 * invalidates a refresh token on use, so concurrent 401s share one request.
 */
function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  const user = getStoredUser()
  if (!refreshToken || !user) return Promise.resolve(false)

  refreshing ??= fetch(`${getServer()}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false
      const next = await res.json()
      saveSession(next.accessToken, next.expiresAt, {
        id: next.userId, email: next.email, role: next.role, emailConfirmed: next.emailConfirmed,
      }, next.refreshToken)
      return true
    })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  try {
    return await fetch(`${getServer()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new ApiError(0, `Cannot reach ${getServer()}. Check the internet connection and the server address.`)
  }
}

async function assertSuccess(res: Response, redirectOnUnauthorized: boolean, path: string) {
  if (res.status === 401 && redirectOnUnauthorized) {
    clearSession()
    throw new ApiError(401, 'Your session expired. Sign in again.')
  }

  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res, path))
}

/**
 * The API returns { error: "..." } from AuthController. ProblemDetails
 * (title/detail) is also handled for endpoints that use the default
 * ASP.NET Core validation response.
 */
async function readErrorMessage(res: Response, path: string): Promise<string> {
  if (res.status === 401 && path === '/api/auth/login') return 'Invalid email or password'

  try {
    const body = await res.json()
    if (typeof body?.error === 'string') return body.error
    if (typeof body?.message === 'string') return body.message
    if (typeof body?.detail === 'string') return body.detail
    if (typeof body?.title === 'string') return body.title
  } catch {
    // Empty or non-JSON body — fall through.
  }

  return `Request failed (${res.status})`
}

async function readBody<T>(res: Response): Promise<T | undefined> {
  if (res.status === 204) return undefined
  const text = await res.text()
  if (!text) return undefined
  return JSON.parse(text) as T
}
