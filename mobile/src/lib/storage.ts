import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

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
const SERVER_KEY = 'biletflow.server'
const LOCALE_KEY = 'biletflow.locale'

// The keychain / keystore on devices, localStorage in the web preview.
const store = {
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
 * the API — use the computer's LAN address, not localhost.
 */
export const DEFAULT_SERVER = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'

// Secure storage is asynchronous, so the session is read once at start-up
// (loadStoredState) and kept in memory; writes go to storage in the background.
let session: StoredSession | null = null
let server = DEFAULT_SERVER
let locale: string | null = null
const clearedListeners = new Set<() => void>()

export async function loadStoredState() {
  const [rawSession, storedServer, storedLocale] = await Promise.all([
    store.get(SESSION_KEY), store.get(SERVER_KEY), store.get(LOCALE_KEY),
  ])
  server = storedServer ?? DEFAULT_SERVER
  locale = storedLocale
  try {
    session = rawSession ? (JSON.parse(rawSession) as StoredSession) : null
  } catch {
    session = null
  }
  // Without a refresh token an expired session cannot be renewed.
  if (session && !session.refreshToken && new Date(session.expiresAt).getTime() <= Date.now()) session = null
}

export function getServer() {
  return server
}

export function setServer(value: string) {
  server = value.trim().replace(/\/+$/, '') || DEFAULT_SERVER
  void store.set(SERVER_KEY, server)
}

export function getStoredLocale() {
  return locale
}

export function setStoredLocale(value: string) {
  locale = value
  void store.set(LOCALE_KEY, value)
}

export function getToken(): string | null {
  return session?.token ?? null
}

export function getRefreshToken(): string | null {
  return session?.refreshToken ?? null
}

export function getStoredUser(): StoredUser | null {
  return session?.user ?? null
}

export function saveSession(token: string, expiresAt: string, user: StoredUser, refreshToken?: string) {
  session = { token, expiresAt, user, refreshToken }
  void store.set(SESSION_KEY, JSON.stringify(session))
}

/** Updates the stored user (e.g. emailConfirmed) while keeping the token and its expiry. */
export function updateStoredUser(patch: Partial<StoredUser>): StoredUser | null {
  if (!session) return null
  session = { ...session, user: { ...session.user, ...patch } }
  void store.set(SESSION_KEY, JSON.stringify(session))
  return session.user
}

export function clearSession() {
  const hadSession = session !== null
  session = null
  void store.remove(SESSION_KEY)
  if (hadSession) clearedListeners.forEach((listener) => listener())
}

/** Called when the session ends without the user signing out (expired or revoked on the server). */
export function onSessionCleared(listener: () => void) {
  clearedListeners.add(listener)
  return () => { clearedListeners.delete(listener) }
}
