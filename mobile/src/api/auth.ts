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
  refreshToken?: string
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
  refreshToken?: string
}

export type RegisterInput = {
  fullName?: string
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
    refreshToken: res.refreshToken,
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

/** POST /api/auth/logout — revokes the refresh token; the access token simply expires. */
export function logout(refreshToken: string): Promise<void> {
  return apiFetch<void>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
    redirectOnUnauthorized: false,
  })
}

/** POST /api/auth/resend-verification — verificationToken only in Development. */
export function resendVerification(email: string): Promise<MessageResponse & { verificationToken: string | null }> {
  return apiFetch('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
    redirectOnUnauthorized: false,
  })
}

/** PUT /api/auth/me — the current password is always required. */
export function updateAccount(input: { currentPassword: string; email?: string; newPassword?: string }): Promise<{
  userId: string
  email: string
  role: Role
  emailConfirmed: boolean
  verificationToken: string | null
}> {
  return apiFetch('/api/auth/me', { method: 'PUT', body: JSON.stringify(input) })
}

/** DELETE /api/auth/me — 409 when the account still owns events or orders that must be kept. */
export function deleteAccount(): Promise<void> {
  return apiFetch<void>('/api/auth/me', { method: 'DELETE' })
}
