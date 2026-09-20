import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fakeGetEvents, type EventSummary } from '../api/events'
import { useAuth } from '../lib/auth'
import { formatDateTime } from '../lib/format'

export default function Events() {
  const { user } = useAuth()
  const [events, setEvents] = useState<EventSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Guards against setting state after the component unmounts.
    let cancelled = false

    fakeGetEvents()
      .then((data) => {
        if (!cancelled) setEvents(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load events')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p>Loading events…</p>

  if (error) {
    return (
      <p role="alert" className="text-red-600">
        {error}
      </p>
    )
  }

  if (events.length === 0) {
    return (
      <div className="space-y-2">
        <p>No events yet.</p>
        {user?.role === 'Organizer' && (
          <Link to="/events/new" className="underline">
            Create your first event
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      <p className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        Demo data — the events API is not implemented on the backend yet.
      </p>
      <ul className="space-y-3">
      {events.map((event) => {
        const soldOut = event.ticketsSold >= event.capacity
        return (
          <li key={event.id} className="border rounded p-4">
            <h2 className="font-semibold">{event.title}</h2>
            <p className="text-sm text-gray-600">
              {formatDateTime(event.startsAt)} · {event.venueName}
            </p>
            <p className="text-sm">
              {event.ticketsSold} / {event.capacity} sold
              {soldOut && <span className="ml-2 text-red-600">Sold out</span>}
            </p>
          </li>
        )
      })}
      </ul>
    </>
  )
}
