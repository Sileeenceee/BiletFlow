// NOTE: the backend has no /api/events endpoints yet — only /api/auth/* and the
// two access-check routes exist. The real functions below match the shape we
// expect and are ready to switch to; the pages still use the fakes.

import { apiFetch } from './client'

export type Visibility = 'public' | 'unlisted' | 'private'

export type EventSummary = {
  id: string
  title: string
  startsAt: string
  venueName: string
  capacity: number
  ticketsSold: number
}

export type CreateEventInput = {
  title: string
  description: string
  category: string
  venueName: string
  venueAddress: string
  startsAt: string
  endsAt: string
  registrationOpensAt: string
  registrationClosesAt: string
  visibility: Visibility
  capacity: number
}

// ---------------------------------------------------------------------------
// Real calls
// ---------------------------------------------------------------------------

export function getEvents(): Promise<EventSummary[]> {
  return apiFetch<EventSummary[]>('/api/events')
}

export function createEvent(input: CreateEventInput): Promise<EventSummary> {
  return apiFetch<EventSummary>('/api/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function delay(ms = 800) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fakeGetEvents(): Promise<EventSummary[]> {
  await delay()
  return [
    {
      id: '1',
      title: 'Astana Tech Meetup',
      startsAt: '2026-10-15T19:00',
      venueName: 'Nazarbayev University',
      capacity: 100,
      ticketsSold: 42,
    },
    {
      id: '2',
      title: 'Autumn Concert',
      startsAt: '2026-11-02T20:00',
      venueName: 'Astana Opera',
      capacity: 500,
      ticketsSold: 500,
    },
  ]
}

export async function fakeCreateEvent(input: CreateEventInput): Promise<EventSummary> {
  await delay()
  return {
    id: String(Date.now()),
    title: input.title,
    startsAt: input.startsAt,
    venueName: input.venueName,
    capacity: input.capacity,
    ticketsSold: 0,
  }
}
