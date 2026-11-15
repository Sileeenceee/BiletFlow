import { apiFetch } from './client'
import type { Order } from './events'

// ---------------------------------------------------------------------------
// Shapes from backend/BiletFlow.Api/Models/PlatformContracts.cs
// ---------------------------------------------------------------------------

export type EventAnalytics = {
  eventId: string
  eventTitle: string
  lifecycleStatus: string
  capacity: { totalCapacity: number; ticketsSold: number; ticketsReserved: number; ticketsRemaining: number; percentSold: number }
  revenue: {
    currency: string
    grossSales: number
    discounts: number
    refunds: number
    processingFees: number
    netRevenue: number
    estimatedPayout: number
    confirmedOrders: number
    refundedOrders: number
    isDemonstration: boolean
  }
  salesOverTime: { date: string; ticketsSold: number; netRevenue: number }[]
  ticketTypes: {
    ticketTypeId: string
    name: string
    price: number
    quantity: number
    sold: number
    reserved: number
    refunded: number
    checkedIn: number
    grossSales: number
    discounts: number
    netRevenue: number
  }[]
  campaigns: {
    campaignId: string
    code: string
    isEnabled: boolean
    linkVisits: number
    redemptions: number
    ticketsSold: number
    grossRevenue: number
    discountTotal: number
    netRevenue: number
  }[]
  attendance: { registered: number; checkedIn: number; absent: number; checkInPercentage: number }
}

export type OrganizerDashboard = {
  eventCount: number
  upcoming: number
  active: number
  completed: number
  cancelled: number
  ticketsSold: number
  grossSales: number
  netRevenue: number
  estimatedPayout: number
  currency: string
  isDemonstration: boolean
  events: {
    eventId: string
    title: string
    startDateUtc: string
    lifecycleStatus: 'Upcoming' | 'Active' | 'Completed' | 'Cancelled'
    isPublished: boolean
    paidSalesStatus: string
    ticketsSold: number
    totalCapacity: number
    netRevenue: number
    checkedIn: number
  }[]
}

export type HistoryEntry = {
  id: string
  createdAt: string
  actorUserId: string | null
  actorEmail: string | null
  actionType: string
  entityType: string
  entityId: string | null
  description: string
}

export type CalendarLinks = {
  eventId: string
  icsUrl: string
  googleCalendarUrl: string
  outlookCalendarUrl: string
  timezone: string
  isCancelled: boolean
}

export type Venue = {
  id: string
  name: string
  address: string
  seatCount: number
  sections: { id: string; name: string; seatCount: number; accessibleSeatCount: number; rows: string[] }[]
}

export type SeatStatus = 'Available' | 'Held' | 'Sold' | 'Unavailable'

export type Seat = {
  seatId: string
  rowLabel: string
  number: string
  isAccessible: boolean
  status: SeatStatus
  label: string
}

/** Short seat name; the API's own label also carries status and price, which the map states separately. */
export function seatLabel(sectionName: string, seat: Seat): string {
  return `${sectionName}, row ${seat.rowLabel}, seat ${seat.number}`
}

export type SeatMapSection = {
  sectionId: string
  name: string
  ticketTypeId: string | null
  ticketTypeName: string | null
  price: number | null
  seats: Seat[]
}

export type SeatMap = {
  eventId: string
  seatingMode: 'General' | 'Assigned'
  venueId: string | null
  venueName: string | null
  holdMinutes: number
  sections: SeatMapSection[]
  legend: Record<string, string>
}

export type Quote = {
  eventId: string
  subtotal: number
  discountTotal: number
  total: number
  currency: string
  promoCode: string | null
  promoError: string | null
  isSimulated: boolean
}

export type Refund = {
  id: string
  orderId: string
  eventId: string
  amount: number
  reason: string | null
  initiatedByUserId: string | null
  isSimulated: boolean
  createdAt: string
}

export type PaidSalesChecklist = {
  eventId: string
  paidSalesStatus: 'None' | 'Pending' | 'Active' | 'Suspended'
  isSimulation: boolean
  activationFeeKzt: number
  canActivate: boolean
  items: { key: string; label: string; completed: boolean }[]
  feePaidAt: string | null
  termsAcceptedAt: string | null
  activatedAt: string | null
}

function query(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

// ---- Analytics, dashboard and history (SRS 4.15, 4.16) --------------------

export function getEventAnalytics(
  eventId: string,
  filters: { from?: string; to?: string; ticketTypeId?: string } = {},
): Promise<EventAnalytics> {
  return apiFetch(`/api/events/${eventId}/analytics${query(filters)}`)
}

export function getOrganizerDashboard(filters: { from?: string; to?: string } = {}): Promise<OrganizerDashboard> {
  return apiFetch(`/api/organizer/dashboard${query(filters)}`)
}

export function getEventHistory(
  eventId: string,
  filters: { from?: string; to?: string; type?: string } = {},
): Promise<HistoryEntry[]> {
  return apiFetch(`/api/events/${eventId}/history${query(filters)}`)
}

export function getActivityTypes(): Promise<string[]> {
  return apiFetch('/api/events/history/activity-types', { redirectOnUnauthorized: false })
}

// ---- Calendar export (SRS 4.11) -------------------------------------------

export function getCalendarLinks(eventId: string): Promise<CalendarLinks> {
  return apiFetch(`/api/events/${eventId}/calendar-links`, { redirectOnUnauthorized: false })
}

// ---- Assigned seating (SRS 4.3.1) -----------------------------------------

export function getVenues(): Promise<Venue[]> {
  return apiFetch('/api/venues', { redirectOnUnauthorized: false })
}

export function getSeatMap(eventId: string): Promise<SeatMap> {
  return apiFetch(`/api/events/${eventId}/seat-map`, { redirectOnUnauthorized: false })
}

export function configureSeating(
  eventId: string,
  input: { seatingMode: 'General' | 'Assigned'; venueId: string | null; sections: { sectionId: string; ticketTypeId: string }[] },
): Promise<SeatMap> {
  return apiFetch(`/api/events/${eventId}/seating`, { method: 'PUT', body: JSON.stringify(input) })
}

// ---- Checkout quote: the server prices the order and validates the promo --

export function getQuote(input: {
  eventId: string
  items: { ticketTypeId: string; quantity: number }[]
  seatIds?: string[]
  promoCode?: string
  campaignToken?: string
}): Promise<Quote> {
  return apiFetch('/api/orders/quote', { method: 'POST', body: JSON.stringify(input), redirectOnUnauthorized: false })
}

// ---- Refunds (SRS 4.9) -----------------------------------------------------

export function refundOrder(eventId: string, orderId: string, reason: string): Promise<Order> {
  return apiFetch(`/api/events/${eventId}/orders/${orderId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  })
}

export function getEventRefunds(eventId: string): Promise<Refund[]> {
  return apiFetch(`/api/events/${eventId}/refunds`)
}

// ---- Paid-sales activation (SRS 4.5) --------------------------------------

export function getPaidSalesChecklist(eventId: string): Promise<PaidSalesChecklist> {
  return apiFetch(`/api/events/${eventId}/paid-sales`)
}

export function payActivationFee(eventId: string): Promise<PaidSalesChecklist> {
  return apiFetch(`/api/events/${eventId}/paid-sales/activation-fee/pay-simulation`, { method: 'POST' })
}

export function verifyOrganizerSimulation(): Promise<{ isVerified: boolean; isSimulation: boolean }> {
  return apiFetch('/api/organizer/verification-simulation', { method: 'POST' })
}

export function activatePaidSalesWithTerms(eventId: string): Promise<{ checklist: PaidSalesChecklist }> {
  return apiFetch(`/api/events/${eventId}/paid-sales/activate-simulation`, {
    method: 'POST',
    body: JSON.stringify({ confirmSimulationOnly: true, acceptTerms: true }),
  })
}

// ---- Event reports (SRS 4.12) ---------------------------------------------

export function reportEvent(eventId: string, reason: string, details: string): Promise<{ id: string }> {
  return apiFetch(`/api/events/${eventId}/reports`, {
    method: 'POST',
    body: JSON.stringify({ reason, details: details || null }),
  })
}

// ---- Support escalation and notifications ---------------------------------

export function escalateSupportCase(caseId: string, reason: string) {
  return apiFetch(`/api/support/cases/${caseId}/escalate`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  })
}

export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/api/notifications/read-all', { method: 'PUT' })
}
