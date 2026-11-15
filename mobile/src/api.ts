import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// ---------------------------------------------------------------------------
// Shapes from backend/BiletFlow.Api (ASP.NET Core serialises to camelCase).
// ---------------------------------------------------------------------------

export type Session = {
  accessToken: string
  refreshToken: string
  expiresAt: string
  userId: string
  email: string
  role: 'Attendee' | 'Organizer' | 'EventAdmin' | 'PlatformAdmin'
}

export type AssignedEvent = {
  id: string
  title: string
  venue: string
  city: string
  startDateUtc: string
  endDateUtc: string
}

/** result: Valid | CheckedIn | AlreadyUsed | Invalid (message says cancelled, refunded, wrong event, campaign QR…). */
export type Verification = {
  result: 'Valid' | 'CheckedIn' | 'AlreadyUsed' | 'Invalid'
  message: string
  ticketId: string | null
  eventTitle: string | null
  ticketTypeName: string | null
  attendeeName: string | null
  attendeeEmail: string | null
  ticketStatus: string | null
  checkedInAt: string | null
  seatLabel: string | null
}

export type Summary = { eventId: string; registered: number; checkedIn: number; remaining: number; checkInPercentage: number }

export type Attendee = {
  ticketId: string
  orderId: string
  attendeeName: string
  attendeeEmail: string
  ticketTypeName: string
  status: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Storage: the keychain / keystore on devices, localStorage in the web preview.
// ---------------------------------------------------------------------------

const SESSION_KEY = 'biletflow.session'
const SERVER_KEY = 'biletflow.server'

const storage = {
  get: (key: string) => Platform.OS === 'web'
    ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
    : SecureStore.getItemAsync(key),
  set: (key: string, value: string) => Platform.OS === 'web'
    ? Promise.resolve(globalThis.localStorage?.setItem(key, value))
    : SecureStore.setItemAsync(key, value),
  remove: (key: string) => Platform.OS === 'web'
    ? Promise.resolve(globalThis.localStorage?.removeItem(key))
    : SecureStore.deleteItemAsync(key),
}

/**
 * Address of the BiletFlow server as seen from the phone. With the Docker
 * stack this is the frontend container (port 8080), which proxies /api to
 * the API over plain HTTP — use the computer's LAN address, not localhost.
 */
export const DEFAULT_SERVER = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'

let server = DEFAULT_SERVER
let session: Session | null = null
let onSignedOut: () => void = () => undefined

export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler
}

export function getServer() {
  return server
}

export async function loadStoredState(): Promise<Session | null> {
  server = (await storage.get(SERVER_KEY)) ?? DEFAULT_SERVER
  const raw = await storage.get(SESSION_KEY)
  try {
    session = raw ? (JSON.parse(raw) as Session) : null
  } catch {
    session = null
  }
  return session
}

async function saveSession(next: Session | null) {
  session = next
  if (next) await storage.set(SESSION_KEY, JSON.stringify(next))
  else await storage.remove(SESSION_KEY)
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function send(path: string, init: RequestInit = {}, authorized = true): Promise<Response> {
  try {
    return await fetch(`${server}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authorized && session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
    })
  } catch {
    throw new ApiError(0, `Cannot reach ${server}. Check the internet connection and the server address.`)
  }
}

let refreshing: Promise<boolean> | null = null

/** The API invalidates a refresh token on use, so concurrent 401s share one refresh request. */
function refresh(): Promise<boolean> {
  if (!session) return Promise.resolve(false)
  const refreshToken = session.refreshToken
  refreshing ??= send('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false)
    .then(async (res) => {
      if (!res.ok) return false
      await saveSession((await res.json()) as Session)
      return true
    })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

async function readJson<T>(res: Response): Promise<T | undefined> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

/** `accept` lists non-2xx statuses whose JSON body is still a normal answer (verification results). */
async function request<T>(path: string, init: RequestInit = {}, accept: number[] = []): Promise<T> {
  let res = await send(path, init)
  if (res.status === 401 && (await refresh())) res = await send(path, init)
  if (res.status === 401) {
    await saveSession(null)
    onSignedOut()
    throw new ApiError(401, 'Your session expired. Sign in again.')
  }

  const body = await readJson<T & { error?: string; title?: string }>(res)
  if (res.ok || accept.includes(res.status)) return body as T
  throw new ApiError(res.status, body?.error ?? body?.title ?? `Request failed (${res.status})`)
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function signIn(serverUrl: string, email: string, password: string): Promise<Session> {
  server = serverUrl.trim().replace(/\/+$/, '') || DEFAULT_SERVER
  const res = await send('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)
  if (res.status === 401) throw new ApiError(401, 'Invalid email or password.')
  if (!res.ok) throw new ApiError(res.status, `Sign-in failed (${res.status}).`)

  const next = (await res.json()) as Session
  // Only event staff use this app; organizers and attendees use the website.
  if (next.role !== 'EventAdmin') {
    throw new ApiError(403, 'This app is for event administrators. Ask the organizer to assign your account to an event.')
  }
  await storage.set(SERVER_KEY, server)
  await saveSession(next)
  return next
}

export async function signOut() {
  const refreshToken = session?.refreshToken
  if (refreshToken) {
    // Best effort: the session is dropped locally even when the server is unreachable.
    await send('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false).catch(() => undefined)
  }
  await saveSession(null)
}

export const getAssignedEvents = () => request<AssignedEvent[]>('/api/event-admin/events')

export const getSummary = (eventId: string) => request<Summary>(`/api/verification/events/${eventId}/summary`)

export const searchAttendees = (eventId: string, search: string) =>
  request<Attendee[]>(`/api/verification/events/${eventId}/attendees${search ? `?search=${encodeURIComponent(search)}` : ''}`)

/** Checks a ticket without admitting anyone. A rejected ticket comes back as 400 with the same body. */
export const validateTicket = (eventId: string, ticketCode: string) =>
  request<Verification>('/api/verification/validate', { method: 'POST', body: JSON.stringify({ ticketCode, eventId }) }, [400])

/** Validates and records entry in one step. 409 = already used, 400 = invalid; both carry the result body. */
export const checkIn = (eventId: string, ticketCode: string) =>
  request<Verification>('/api/verification/check-in', { method: 'POST', body: JSON.stringify({ ticketCode, eventId }) }, [400, 409])

export const reverseCheckIn = (ticketId: string) =>
  request<{ ticketId: string; status: string; message: string }>(`/api/verification/tickets/${ticketId}/reverse`, { method: 'POST' })
