import { apiFetch } from './client'
import type { VerificationResult } from './workflows'

// The scanner needs the verification body for rejected tickets too: the API answers an
// invalid ticket with 400 and an already-used one with 409, both carrying the result.
// The website's workflows.ts turns those into errors, so the app calls them here.

export type Verification = Omit<VerificationResult, 'result'> & {
  result: 'Valid' | 'CheckedIn' | 'AlreadyUsed' | 'Invalid'
  seatLabel?: string | null
}

/** Checks a ticket without admitting anyone. */
export const validateTicket = (eventId: string, ticketCode: string) =>
  apiFetch<Verification>('/api/verification/validate', {
    method: 'POST', body: JSON.stringify({ ticketCode, eventId }), accept: [400, 409],
  })

/** Validates and records entry in one step. */
export const checkInTicket = (eventId: string, ticketCode: string) =>
  apiFetch<Verification>('/api/verification/check-in', {
    method: 'POST', body: JSON.stringify({ ticketCode, eventId }), accept: [400, 409],
  })
