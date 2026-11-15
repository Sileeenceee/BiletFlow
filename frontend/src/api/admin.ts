import { apiFetch } from './client'
import type { PaidSalesChecklist } from './platform'
import type { SupportCase } from './workflows'

// Shapes from backend/BiletFlow.Api/Controllers/AdminController.cs (PlatformAdminOnly).

export type AdminOverview = {
  users: number
  suspendedUsers: number
  organizers: number
  events: number
  publishedEvents: number
  suspendedEvents: number
  openReports: number
  escalatedSupportCases: number
  orders: number
  failedPayments: number
  refunds: number
  simulatedGrossVolume: number
  isDemonstration: boolean
}

export type AdminUser = {
  id: string
  email: string
  fullName: string
  role: string
  emailConfirmed: boolean
  isSuspended: boolean
  createdAt: string
}

export type AdminEvent = {
  id: string
  title: string
  organizerId: string
  organizerEmail: string
  startDateUtc: string
  lifecycleStatus: string
  isPublished: boolean
  isSuspended: boolean
  visibility: string
  paidSalesStatus: string
  ticketsIssued: number
  openReports: number
}

export type EventReport = {
  id: string
  eventId: string
  eventTitle: string
  reporterUserId: string
  reporterEmail: string
  reason: string
  details: string | null
  status: 'Open' | 'Dismissed' | 'ActionTaken'
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
}

export type AdminOrder = {
  id: string
  eventId: string
  eventTitle: string
  attendeeId: string
  attendeeEmail: string
  status: string
  total: number
  discountTotal: number
  feeTotal: number
  promoCode: string | null
  createdAt: string
  confirmedAt: string | null
}

export type AdminPayment = {
  id: string
  orderId: string
  eventId: string
  eventTitle: string
  attendeeEmail: string
  amount: number
  status: string
  isSimulated: boolean
  createdAt: string
}

export type AdminRefund = {
  id: string
  orderId: string
  eventId: string
  amount: number
  reason: string | null
  isSimulated: boolean
  createdAt: string
}

export type AdminActivation = {
  id: string
  eventId: string
  eventTitle: string
  organizerId: string
  organizerEmail: string
  organizerVerified: boolean
  paidSalesStatus: string
  feeAmount: number
  feePaidAt: string | null
  termsAcceptedAt: string | null
  activatedAt: string | null
  isSimulated: boolean
}

export type AdminPromoActivity = {
  campaignId: string
  eventId: string
  eventTitle: string
  code: string
  isEnabled: boolean
  maxRedemptions: number | null
  redemptions: number
  linkVisits: number
  discountTotal: number
  createdAt: string
}

export type PlatformSettings = {
  activationFeeKzt: number
  processingFeePercent: number
  processingFeeFixedKzt: number
  currency: string
  updatedAt: string
}

export const exportTypes = ['users', 'events', 'orders', 'payments', 'refunds'] as const

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

const post = (path: string, body?: unknown) =>
  apiFetch<void>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const getOverview = () => apiFetch<AdminOverview>('/api/admin/overview')

export const getUsers = (search: string, role: string) =>
  apiFetch<AdminUser[]>(`/api/admin/users${query({ search, role })}`)
export const suspendUser = (userId: string, reason: string) => post(`/api/admin/users/${userId}/suspend`, { reason })
export const reinstateUser = (userId: string) => post(`/api/admin/users/${userId}/reinstate`)
export const changeUserRole = (userId: string, role: string) =>
  apiFetch<AdminUser>(`/api/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) })

export const getAdminEvents = (search: string, status: string) =>
  apiFetch<AdminEvent[]>(`/api/admin/events${query({ search, status })}`)
export const suspendEvent = (eventId: string, reason: string) => post(`/api/admin/events/${eventId}/suspend`, { reason })
export const reinstateEvent = (eventId: string) => post(`/api/admin/events/${eventId}/reinstate`)
export const suspendPaidSales = (eventId: string, reason: string) =>
  post(`/api/admin/events/${eventId}/paid-sales/suspend`, { reason })
export const reinstatePaidSales = (eventId: string) =>
  apiFetch<PaidSalesChecklist>(`/api/admin/events/${eventId}/paid-sales/reinstate`, { method: 'POST' })

export const getReports = (status: string) => apiFetch<EventReport[]>(`/api/admin/reports${query({ status })}`)
export const resolveReport = (
  reportId: string,
  input: { status: 'Dismissed' | 'ActionTaken'; note: string; suspendEvent: boolean },
) => apiFetch<EventReport>(`/api/admin/reports/${reportId}`, { method: 'PUT', body: JSON.stringify(input) })

export const getAdminOrders = (search: string, status: string) =>
  apiFetch<AdminOrder[]>(`/api/admin/orders${query({ search, status })}`)
export const getPayments = (search: string, status: string) =>
  apiFetch<AdminPayment[]>(`/api/admin/payments${query({ search, status })}`)
export const getRefunds = () => apiFetch<AdminRefund[]>('/api/admin/refunds')
export const getActivations = () => apiFetch<AdminActivation[]>('/api/admin/paid-sales-activations')
export const getPromoActivity = () => apiFetch<AdminPromoActivity[]>('/api/admin/promo-activity')
export const getAdminSupportCases = (escalated: boolean) =>
  apiFetch<SupportCase[]>(`/api/admin/support-cases${query({ escalated: escalated ? 'true' : undefined })}`)

export const getSettings = () => apiFetch<PlatformSettings>('/api/admin/settings')
export const saveSettings = (input: Pick<PlatformSettings, 'activationFeeKzt' | 'processingFeePercent' | 'processingFeeFixedKzt'>) =>
  apiFetch<PlatformSettings>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(input) })
