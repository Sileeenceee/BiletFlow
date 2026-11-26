import type { CreateEventInput, EventSummary } from '../../api/events'

/** The update payload for an event as loaded, with some fields changed (PUT replaces the whole event). */
export function toEventInput(event: EventSummary, changes: Partial<CreateEventInput> = {}): CreateEventInput {
  return {
    title: event.title,
    description: event.description,
    venue: event.venue,
    cityId: event.cityId,
    startDateUtc: event.startDateUtc,
    endDateUtc: event.endDateUtc,
    isPublished: event.isPublished,
    category: event.category ?? null,
    imageUrls: event.imageUrls ?? [],
    visibility: event.visibility ?? 'Public',
    registrationOpensAt: event.registrationOpensAt ?? null,
    registrationClosesAt: event.registrationClosesAt ?? null,
    capacity: event.capacity ?? null,
    venueAddress: event.venueAddress ?? null,
    timezone: event.timezone ?? null,
    refundPolicy: event.refundPolicy ?? null,
    ...changes,
  }
}

/** yyyy-MM-ddTHH:mm in local time for datetime-local inputs. */
export function localDateTime(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
