// One place to change when i18n lands (kk / ru / en).
export const LOCALE = 'ru-RU'

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE)
}
