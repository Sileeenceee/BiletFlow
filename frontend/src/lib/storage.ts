/** Mirrors UserRole in backend/BiletFlow.Api/Models/AuthModels.cs */
export type Role = 'Attendee' | 'Organizer' | 'EventAdmin' | 'PlatformAdmin'

export type StoredUser = {
  id: string
  email: string
  role: Role
  emailConfirmed: boolean
}

type StoredSession = {
  token: string
  /** ISO 8601 string from the API's expiresAt field. */
  expiresAt: string
  user: StoredUser
  /** Seven-day token used to obtain a new access token without signing in again. */
  refreshToken?: string
}

const SESSION_KEY = 'biletflow.session'

function readSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const session = JSON.parse(raw) as StoredSession
    // The API issues 60-minute tokens; drop the session once it lapses so the
    // UI does not show a signed-in state that every request would reject.
    // A session with a refresh token survives: the API client renews it on the next 401.
    if (!session.refreshToken && new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function getToken(): string | null {
  return readSession()?.token ?? null
}

export function getStoredUser(): StoredUser | null {
  return readSession()?.user ?? null
}

export function getRefreshToken(): string | null {
  return readSession()?.refreshToken ?? null
}

export function saveSession(token: string, expiresAt: string, user: StoredUser, refreshToken?: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt, user, refreshToken }))
}

/** Updates the stored user (e.g. emailConfirmed) while keeping the token and its expiry. */
export function updateStoredUser(patch: Partial<StoredUser>): StoredUser | null {
  const session = readSession()
  if (!session) return null

  const user = { ...session.user, ...patch }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, user }))
  return user
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
