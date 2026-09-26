import { apiFetch } from './client'

export type EventSummary = {
  id: string
  title: string
  description: string
  venue: string
  city: string
  startDateUtc: string
  endDateUtc: string
  isPublished: boolean
}

export type CreateEventInput = {
  title: string
  description: string
  venue: string
  city: string
  startDateUtc: string
  endDateUtc: string
  isPublished: boolean
}

export function getEvents(organizer: boolean): Promise<EventSummary[]> {
  return apiFetch<EventSummary[]>(organizer ? '/api/events/me' : '/api/events')
}

export function createEvent(input: CreateEventInput): Promise<EventSummary> {
  return apiFetch<EventSummary>('/api/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}