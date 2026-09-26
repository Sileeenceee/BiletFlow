import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getEvents, type EventSummary } from '../api/events'
import { useAuth } from '../lib/auth'
import { formatDateTime } from '../lib/format'

export default function Events() {
  const { user } = useAuth()
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const [events, setEvents] = useState<EventSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Guards against setting state after the component unmounts.
    let cancelled = false

    getEvents(isOrganizer)
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
  }, [isOrganizer])

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
        <p>{isOrganizer ? 'You have no events yet.' : 'No published events yet.'}</p>
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
      <ul className="space-y-3">
      {events.map((event) => {
        return (
          <li key={event.id} className="border rounded p-4">
            <h2 className="font-semibold">{event.title}</h2>
            <p className="text-sm text-gray-600">
              {formatDateTime(event.startDateUtc)} · {event.venue}
              {event.city && `, ${event.city}`}
            </p>
            {isOrganizer && <p className="text-sm">{event.isPublished ? 'Published' : 'Draft'}</p>}
          </li>
        )
      })}
      </ul>
    </>
  )
}
