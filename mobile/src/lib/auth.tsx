import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { logout, type Session } from '../api/auth'
import { clearSession, getRefreshToken, getStoredUser, onSessionCleared, saveSession, updateStoredUser, type StoredUser } from './storage'

type AuthContextValue = {
  user: StoredUser | null
  signIn: (session: Session) => void
  signOut: () => void
  /** Changes fields of the signed-in user (e.g. emailConfirmed) without a new sign-in. */
  updateUser: (patch: Partial<StoredUser>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Render only after loadStoredState() has resolved, so the stored session is already in memory. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser())

  // The API client clears the session when the server rejects it (expired or revoked refresh token).
  useEffect(() => onSessionCleared(() => setUser(null)), [])

  function signIn(session: Session) {
    saveSession(session.token, session.expiresAt, session.user, session.refreshToken)
    setUser(session.user)
  }

  function signOut() {
    // Best effort: the session is dropped locally even when the API is unreachable.
    const refreshToken = getRefreshToken()
    if (refreshToken) void logout(refreshToken).catch(() => undefined)
    clearSession()
    setUser(null)
  }

  function updateUser(patch: Partial<StoredUser>) {
    const updated = updateStoredUser(patch)
    if (updated) setUser(updated)
  }

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export const isOrganizerRole = (role: StoredUser['role'] | undefined) => role === 'Organizer' || role === 'PlatformAdmin'
