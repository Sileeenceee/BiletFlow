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

/** "Sat, 14 Nov, 19:00" in the event's own time zone when it has one. */
export function formatEventDate(value: string, timeZone?: string | null): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  try {
    return date.toLocaleString(LOCALE, timeZone ? { ...options, timeZone } : options)
  } catch {
    return date.toLocaleString(LOCALE, options)
  }
}

function inZone(options: Intl.DateTimeFormatOptions, timeZone?: string | null): Intl.DateTimeFormatOptions {
  if (!timeZone) return options
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone })
    return { ...options, timeZone }
  } catch {
    return options
  }
}

/** "Sat, 14 Nov 2026". */
export function formatEventDay(value: string, timeZone?: string | null): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(LOCALE, inZone({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, timeZone))
}

/** "19:00 – 22:30"; the end gets its date too when it falls on another day. */
export function formatTimeRange(start: string, end: string, timeZone?: string | null): string {
  const from = new Date(start)
  const to = new Date(end)
  if (Number.isNaN(from.getTime())) return start
  const time = inZone({ hour: '2-digit', minute: '2-digit' }, timeZone)
  const first = from.toLocaleTimeString(LOCALE, time)
  if (Number.isNaN(to.getTime())) return first
  const sameDay = formatEventDay(start, timeZone) === formatEventDay(end, timeZone)
  return `${first} – ${sameDay ? to.toLocaleTimeString(LOCALE, time) : formatEventDate(end, timeZone)}`
}

/** "14 Nov". */
export function formatDayMonth(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE)
}

// The design writes prices the Kazakh way in every language: "8 000 ₸".
const KZT_NUMBER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export function formatKzt(value: number): string {
  return `${value < 0 ? '−' : ''}${KZT_NUMBER.format(Math.abs(value))} ₸`
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Turns a date input (yyyy-mm-dd) into the ISO instant the API expects; "to" covers the whole day. */
export function dayBoundary(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString()
}

/** "PromoCampaignCreated" -> "Promo campaign created". */
export function humanize(value: string): string {
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Short, readable order reference: the first eight characters of its id. */
export function orderCode(order: { id: string }): string {
  return order.id.slice(0, 8).toUpperCase()
}
