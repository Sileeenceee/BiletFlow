export type DateRange = 'any' | 'today' | 'weekend' | 'week' | 'month'

export const DATE_RANGES: DateRange[] = ['any', 'today', 'weekend', 'month']

export function isDateRange(value: string | null): value is DateRange {
  return value === 'any' || value === 'today' || value === 'weekend' || value === 'week' || value === 'month'
}

/** Local-time window for a range; `null` means no limit. */
function rangeBounds(range: DateRange, now: Date): [Date, Date] | null {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = (n: number) => new Date(startOfDay.getFullYear(), startOfDay.getMonth(), startOfDay.getDate() + n)
  switch (range) {
    case 'today':
      return [startOfDay, days(1)]
    case 'week':
      return [startOfDay, days(7)]
    case 'weekend': {
      const day = startOfDay.getDay() // 0 Sunday … 6 Saturday
      if (day === 0) return [startOfDay, days(1)]
      return [days(Math.max(0, 6 - day)), days(8 - day)]
    }
    case 'month':
      return [startOfDay, new Date(startOfDay.getFullYear(), startOfDay.getMonth() + 1, 1)]
    default:
      return null
  }
}

/** True when an event running from start to end overlaps the range. */
export function inDateRange(startUtc: string, endUtc: string, range: DateRange, now = new Date()): boolean {
  const bounds = rangeBounds(range, now)
  if (!bounds) return true
  const start = new Date(startUtc)
  const end = new Date(endUtc || startUtc)
  return start < bounds[1] && end >= bounds[0]
}
