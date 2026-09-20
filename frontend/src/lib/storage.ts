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
}

const SESSION_KEY = 'biletflow.session'

function readSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const session = JSON.parse(raw) as StoredSession
    // The API issues 60-minute tokens; drop the session once it lapses so the
    // UI does not show a signed-in state that every request would reject.
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
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

export function saveSession(token: string, expiresAt: string, user: StoredUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt, user }))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
