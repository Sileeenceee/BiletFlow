import { apiFetch } from './client'

export type OrganizerProfile = {
  id: string
  userId: string
  businessName: string
  displayName: string
  contactEmail: string | null
  sandboxPayoutProvider: string | null
  sandboxPayoutReference: string | null
  isVerified: boolean
}

export type SupportMessage = {
  id: string
  senderUserId: string
  senderRole: string
  body: string
  createdAt: string
}

export type SupportCase = {
  id: string
  type: string
  category: string
  subject: string
  status: string
  requesterUserId: string
  eventId: string | null
  orderId: string | null
  ticketId: string | null
  assignedToUserId: string | null
  createdAt: string
  updatedAt: string
  messages: SupportMessage[]
}

export type AssignedEvent = {
  id: string
  title: string
  venue: string
  city: string
  startDateUtc: string
  endDateUtc: string
}

export type VerificationResult = {
  result: string
  message: string
  ticketId: string | null
  eventTitle: string | null
  ticketTypeName: string | null
  attendeeName: string | null
  attendeeEmail: string | null
  ticketStatus: string | null
  checkedInAt: string | null
}

export type CheckInSummary = {
  eventId: string
  registered: number
  checkedIn: number
  remaining: number
  checkInPercentage: number
}

export type StaffAssignment = {
  userId: string
  email: string
  assignedAt: string
}

export function getOrganizerProfile(): Promise<OrganizerProfile> {
  return apiFetch('/api/organizer/profile')
}

export function saveOrganizerProfile(input: {
  businessName: string
  displayName: string
  contactEmail: string
  sandboxPayoutProvider: string
  sandboxPayoutReference: string
}): Promise<OrganizerProfile> {
  return apiFetch('/api/organizer/profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function createOrganizerProfile(input: {
  businessName: string
  displayName: string
  contactEmail: string
  sandboxPayoutProvider: string
  sandboxPayoutReference: string
}): Promise<OrganizerProfile> {
  return apiFetch('/api/organizer/profile', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getSupportCases(): Promise<SupportCase[]> {
  return apiFetch('/api/support/cases')
}

export function createSupportCase(input: {
  category: string
  subject: string
  message: string
  eventId?: string
  orderId?: string
  ticketId?: string
}): Promise<SupportCase> {
  return apiFetch('/api/support/cases', { method: 'POST', body: JSON.stringify(input) })
}

export function addSupportMessage(caseId: string, body: string): Promise<SupportCase> {
  return apiFetch(`/api/support/cases/${caseId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function updateSupportCase(caseId: string, status: string): Promise<SupportCase> {
  return apiFetch(`/api/support/cases/${caseId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export function getNotifications(): Promise<{
  id: string
  type: string
  title: string
  message: string
  relatedCaseId: string | null
  createdAt: string
  readAt: string | null
}[]> {
  return apiFetch('/api/notifications')
}

export function markNotificationRead(notificationId: string): Promise<void> {
  return apiFetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' })
}

export function getAssignedEvents(): Promise<AssignedEvent[]> {
  return apiFetch('/api/event-admin/events')
}

export function validateTicket(ticketCode: string): Promise<VerificationResult> {
  return apiFetch('/api/verification/validate', {
    method: 'POST',
    body: JSON.stringify({ ticketCode }),
  })
}

export function checkInTicket(ticketCode: string): Promise<VerificationResult> {
  return apiFetch('/api/verification/check-in', {
    method: 'POST',
    body: JSON.stringify({ ticketCode }),
  })
}

export function reverseCheckIn(ticketId: string): Promise<void> {
  return apiFetch(`/api/verification/tickets/${ticketId}/reverse`, { method: 'POST' })
}

export function getCheckInSummary(eventId: string): Promise<CheckInSummary> {
  return apiFetch(`/api/verification/events/${eventId}/summary`)
}

export function searchEventAttendees(eventId: string, search: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  return apiFetch<{
    ticketId: string
    orderId: string
    attendeeName: string
    attendeeEmail: string
    ticketTypeName: string
    status: string
  }[]>(`/api/verification/events/${eventId}/attendees${query}`)
}

export function getEventStaff(eventId: string): Promise<StaffAssignment[]> {
  return apiFetch(`/api/events/${eventId}/event-admins`)
}

export function assignEventStaff(eventId: string, email: string): Promise<void> {
  return apiFetch(`/api/events/${eventId}/event-admins`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function removeEventStaff(eventId: string, userId: string): Promise<void> {
  return apiFetch(`/api/events/${eventId}/event-admins/${userId}`, { method: 'DELETE' })
}
