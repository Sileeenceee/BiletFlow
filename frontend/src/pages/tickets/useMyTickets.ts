import { useEffect, useState } from 'react'
import { apiBlob } from '../../api/client'
import { getEvent, getMyOrders, type EventSummary, type Order } from '../../api/events'
import { useLocale } from '../../lib/i18n'

/**
 * The attendee's orders plus the events they belong to (orders carry only the event title, and the
 * ticket pages need dates and venues). An event that can no longer be loaded maps to null.
 */
export function useMyTickets() {
  const { t } = useLocale()
  const [orders, setOrders] = useState<Order[]>([])
  const [events, setEvents] = useState<Record<string, EventSummary | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadedAt, setLoadedAt] = useState(0)

  useEffect(() => {
    let active = true
    getMyOrders()
      .then(async (rows) => {
        const ids = [...new Set(rows.map((order) => order.eventId))]
        const loaded = await Promise.all(ids.map((id) => getEvent(id).catch(() => null)))
        if (!active) return
        setOrders(rows)
        setEvents(Object.fromEntries(ids.map((id, index) => [id, loaded[index]])))
        setLoadedAt(Date.now())
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('orders.loadError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  return { orders, setOrders, events, loading, error, setError, loadedAt }
}

/** A ticket's QR image as an object URL; the order list itself does not carry the images. */
export function useTicketQr(ticketId: string, inline: string | null | undefined, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null)
  useEffect(() => {
    if (!enabled || inline) return
    let url = ''
    let active = true
    apiBlob(`/api/tickets/${ticketId}/qr`)
      .then((blob) => {
        if (!active) return
        url = URL.createObjectURL(blob)
        setLoaded({ id: ticketId, url })
      })
      .catch(() => undefined)
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [enabled, inline, ticketId])
  if (!enabled) return null
  return inline ?? (loaded?.id === ticketId ? loaded.url : null)
}

/** The signed-in attendee's orders for one event; empty when not signed in or not wanted. */
export function useEventOrders(eventId: string, enabled: boolean) {
  const [orders, setOrders] = useState<Order[]>([])
  useEffect(() => {
    if (!enabled) return
    let active = true
    getMyOrders()
      .then((rows) => { if (active) setOrders(rows.filter((order) => order.eventId === eventId)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [enabled, eventId])
  return enabled ? orders : []
}
