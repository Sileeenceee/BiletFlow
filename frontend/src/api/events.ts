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
  category?: string | null
  imageUrls?: string[]
  visibility?: 'Public' | 'Unlisted' | 'Private'
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
  isCancelled?: boolean
  capacity?: number | null
  paidSalesStatus?: 'None' | 'Pending' | 'Active' | 'Suspended'
}

export type CreateEventInput = {
  title: string
  description: string
  venue: string
  city: string
  startDateUtc: string
  endDateUtc: string
  isPublished: boolean
  category?: string | null
  imageUrls?: string[]
  visibility?: 'Public' | 'Unlisted' | 'Private'
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
  capacity?: number | null
}

export type TicketType = {
  id: string
  eventId: string
  name: string
  description: string | null
  price: number
  quantity: number
  soldQuantity: number
  availableQuantity: number
  salesStartAt: string | null
  salesEndAt: string | null
  maxPerOrder: number
  isHidden: boolean
  reservedQuantity: number
  refundedQuantity: number
  checkedInQuantity: number
}

export type CheckoutItem = { ticketTypeId: string; quantity: number }

export type Ticket = {
  id: string
  code: string
  status: string
  attendeeName: string
  attendeeEmail: string
  ticketTypeName: string
  qrCodeDataUri: string | null
}

export type OrderItem = {
  ticketTypeId: string
  ticketTypeName: string
  quantity: number
  unitPrice: number
  tickets: Ticket[]
}

export type Order = {
  id: string
  eventId: string
  eventTitle: string
  status: string
  paymentMode: string
  total: number
  createdAt: string
  items: OrderItem[]
  discountTotal: number
  feeTotal: number
  expiresAt: string | null
  paymentStatus: string | null
  promoCode: string | null
}

export type PromoCampaign = {
  id: string
  eventId: string
  code: string
  discountType: 'Percentage' | 'FixedKzt'
  discountValue: number
  startsAt: string | null
  endsAt: string | null
  maxRedemptions: number | null
  redemptions: number
  isEnabled: boolean
  linkVisits: number
  ticketTypeIds: string[]
  campaignUrl: string
}

export type CampaignAnalytics = {
  campaignId: string
  code: string
  redemptions: number
  ticketsSold: number
  grossRevenue: number
  discountTotal: number
  netRevenue: number
}

export type Attendee = {
  ticketId: string
  orderId: string
  attendeeName: string
  attendeeEmail: string
  ticketTypeName: string
  status: string
}

export function getEvents(organizer: boolean): Promise<EventSummary[]> {
  return apiFetch<EventSummary[]>(organizer ? '/api/events/me' : '/api/events')
}

export function getEvent(eventId: string): Promise<EventSummary> {
  return apiFetch<EventSummary>(`/api/events/${eventId}`)
}

export function createEvent(input: CreateEventInput): Promise<EventSummary> {
  return apiFetch<EventSummary>('/api/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateEvent(eventId: string, input: CreateEventInput): Promise<EventSummary> {
  return apiFetch<EventSummary>(`/api/events/${eventId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function duplicateEvent(eventId: string): Promise<EventSummary> {
  return apiFetch<EventSummary>(`/api/events/${eventId}/duplicate`, { method: 'POST' })
}

export function cancelEvent(eventId: string): Promise<EventSummary> {
  return apiFetch<EventSummary>(`/api/events/${eventId}/cancel`, { method: 'POST' })
}

export function getTicketTypes(eventId: string): Promise<TicketType[]> {
  return apiFetch<TicketType[]>(`/api/events/${eventId}/ticket-types`)
}

export function saveTicketType(
  eventId: string,
  input: Omit<TicketType, 'id' | 'eventId' | 'soldQuantity' | 'availableQuantity' | 'reservedQuantity' | 'refundedQuantity' | 'checkedInQuantity'>,
  ticketTypeId?: string,
): Promise<TicketType> {
  return apiFetch<TicketType>(
    `/api/events/${eventId}/ticket-types${ticketTypeId ? `/${ticketTypeId}` : ''}`,
    { method: ticketTypeId ? 'PUT' : 'POST', body: JSON.stringify(input) },
  )
}

export function deleteTicketType(eventId: string, ticketTypeId: string): Promise<void> {
  return apiFetch<void>(`/api/events/${eventId}/ticket-types/${ticketTypeId}`, { method: 'DELETE' })
}

export function checkout(input: {
  eventId: string
  attendeeName: string
  attendeeEmail: string
  items: CheckoutItem[]
  promoCode?: string
  campaignToken?: string
}): Promise<Order> {
  return apiFetch<Order>('/api/orders/checkout', { method: 'POST', body: JSON.stringify(input) })
}

export function getMyOrders(): Promise<Order[]> {
  return apiFetch<Order[]>('/api/orders/me')
}

export function getOrder(orderId: string): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${orderId}`)
}

export function payOrder(orderId: string, outcome: 'succeeded' | 'failed'): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${orderId}/pay`, {
    method: 'POST',
    body: JSON.stringify({ outcome }),
  })
}

export function cancelOrder(orderId: string): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${orderId}/cancel`, { method: 'POST' })
}

export function getEventOrders(eventId: string): Promise<Order[]> {
  return apiFetch<Order[]>(`/api/events/${eventId}/orders`)
}

export function cancelFreeOrder(eventId: string, orderId: string): Promise<Order> {
  return apiFetch<Order>(`/api/events/${eventId}/orders/${orderId}/cancel`, { method: 'POST' })
}

export function getAttendees(eventId: string, search: string): Promise<Attendee[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  return apiFetch<Attendee[]>(`/api/events/${eventId}/attendees${query}`)
}

export function getCampaigns(eventId: string): Promise<PromoCampaign[]> {
  return apiFetch<PromoCampaign[]>(`/api/events/${eventId}/campaigns`)
}

export function getCampaignAnalytics(eventId: string): Promise<CampaignAnalytics[]> {
  return apiFetch<CampaignAnalytics[]>(`/api/events/${eventId}/campaign-analytics`)
}

export function saveCampaign(
  eventId: string,
  input: {
    code: string
    discountType: 'Percentage' | 'FixedKzt'
    discountValue: number
    startsAt: string | null
    endsAt: string | null
    maxRedemptions: number | null
    ticketTypeIds: string[]
  },
  campaignId?: string,
): Promise<PromoCampaign> {
  return apiFetch<PromoCampaign>(
    `/api/events/${eventId}/campaigns${campaignId ? `/${campaignId}` : ''}`,
    { method: campaignId ? 'PUT' : 'POST', body: JSON.stringify(input) },
  )
}

export function deleteCampaign(eventId: string, campaignId: string): Promise<void> {
  return apiFetch<void>(`/api/events/${eventId}/campaigns/${campaignId}`, { method: 'DELETE' })
}

export function activatePaidSales(eventId: string): Promise<void> {
  return apiFetch<void>(`/api/events/${eventId}/paid-sales/activate-simulation`, {
    method: 'POST',
    body: JSON.stringify({ confirmSimulationOnly: true }),
  })
}

export function resolveCampaign(token: string): Promise<{
  eventId: string
  eventTitle: string
  code: string
  discountType: string
  discountValue: number
  endsAt: string | null
  message: string
}> {
  return apiFetch(`/api/campaigns/resolve/${encodeURIComponent(token)}`, { redirectOnUnauthorized: false })
}