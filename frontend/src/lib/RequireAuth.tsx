import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './auth'
import type { Role } from './storage'

type Props = {
  children: ReactNode
  roles?: Role[]
}

/**
 * Client-side convenience only. The backend must reject unauthorised
 * requests on its own — this just stops legitimate users from landing
 * on pages that would fail.
 */
export function RequireAuth({ children, roles }: Props) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/events" replace />
  }

  return <>{children}</>
}
