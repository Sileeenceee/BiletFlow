// Number and date locale; lib/i18n.tsx switches it together with the interface language.
let LOCALE = 'ru-RU'

export function setFormatLocale(locale: string) {
  LOCALE = locale
}

export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(LOCALE, { dateStyle: 'medium' })
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE)
}

export function formatKzt(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0,
  }).format(value)
}

/** Turns a yyyy-mm-dd date into the ISO instant the API expects; "to" covers the whole day. */
export function dayBoundary(value: string, endOfDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString()
}

/** "PromoCampaignCreated" -> "Promo campaign created". */
export function humanize(value: string): string {
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

/** Badge colour for an order or ticket status. */
export const statusTone = (status: string) =>
  status === 'Confirmed' || status === 'Valid' || status === 'CheckedIn' ? 'success'
    : status === 'Pending' ? 'warning'
      : status === 'Refunded' || status === 'Cancelled' ? 'danger' : 'neutral'
