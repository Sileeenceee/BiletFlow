import type { Role, StoredUser } from '../lib/storage'
import { apiFetch } from './client'

// ---------------------------------------------------------------------------
// Response shapes as returned by backend/BiletFlow.Api/Controllers/AuthController.cs
// ASP.NET Core serialises to camelCase by default.
// ---------------------------------------------------------------------------

/** POST /api/auth/login -> 200, or 401 with an empty body. */
type AuthResponse = {
  accessToken: string
  expiresAt: string
  userId: string
  email: string
  role: Role
  emailConfirmed: boolean
}

/** POST /api/auth/register -> 201. Note: no token is issued here. */
type RegisterResponse = {
  id: string
  email: string
  role: Role
  emailConfirmed: boolean
  /** Only populated in the Development environment. */
  verificationToken: string | null
}

type MessageResponse = { message: string }

/** POST /api/auth/forgot-password -> 200; resetToken only in Development. */
type ForgotPasswordResponse = MessageResponse & { resetToken: string | null }

export type Session = {
  token: string
  expiresAt: string
  user: StoredUser
}

export type RegisterInput = {
  email: string
  password: string
  /** Backend field: createOrganizerProfile. Registers the user as Organizer. */
  createOrganizerProfile: boolean
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<Session> {
  const res = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    redirectOnUnauthorized: false,
  })

  return {
    token: res.accessToken,
    expiresAt: res.expiresAt,
    user: {
      id: res.userId,
      email: res.email,
      role: res.role,
      emailConfirmed: res.emailConfirmed,
    },
  }
}

export function registerAccount(input: RegisterInput): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnUnauthorized: false,
  })
}

export function verifyEmail(token: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
    redirectOnUnauthorized: false,
  })
}

export function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
    redirectOnUnauthorized: false,
  })
}

export function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
    redirectOnUnauthorized: false,
  })
}

/** GET /api/auth/me — requires a valid token. */
export function getCurrentUser(): Promise<{
  userId: string
  email: string
  role: Role
  emailConfirmed: boolean
}> {
  return apiFetch('/api/auth/me')
}
