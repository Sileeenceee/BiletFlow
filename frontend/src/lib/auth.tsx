import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Session } from '../api/auth'
import { clearSession, getStoredUser, saveSession, updateStoredUser, type StoredUser } from './storage'

type AuthContextValue = {
  user: StoredUser | null
  signIn: (session: Session) => void
  signOut: () => void
  /** Changes fields of the signed-in user (e.g. emailConfirmed) without a new sign-in. */
  updateUser: (patch: Partial<StoredUser>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Runs once on first render. Returns null if the stored token has expired.
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser())

  function signIn(session: Session) {
    saveSession(session.token, session.expiresAt, session.user)
    setUser(session.user)
  }

  function signOut() {
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
