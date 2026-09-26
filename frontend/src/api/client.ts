import { clearSession, getToken } from '../lib/storage'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

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
   * normal result, so they must not trigger the session-expired redirect.
   * Defaults to true for authenticated calls.
   */
  redirectOnUnauthorized?: boolean
}

export async function apiFetch<T>(path: string, options: Options = {}): Promise<T> {
  const { redirectOnUnauthorized = true, ...init } = options
  const token = getToken()

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (res.status === 401 && redirectOnUnauthorized) {
    clearSession()
    window.location.href = '/login'
    throw new ApiError(401, 'Your session expired. Sign in again.')
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res))
  }

  return (await readBody<T>(res)) as T
}

/**
 * The API returns { error: "..." } from AuthController. ProblemDetails
 * (title/detail) is also handled for endpoints that use the default
 * ASP.NET Core validation response.
 */
async function readErrorMessage(res: Response): Promise<string> {
  if (res.status === 401) return 'Invalid email or password'

  try {
    const body = await res.json()
    if (typeof body?.error === 'string') return body.error
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
