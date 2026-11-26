import type { EventSummary, Order, TicketType } from '../../api/events'
import type { CalendarLinks, Quote, Seat, SeatMap } from '../../api/platform'
import type { SummaryLine } from './shared'

export type Step = 'select' | 'seats' | 'details'

/** Everything the event page's steps share; owned by EventDetail. */
export type Flow = {
  event: EventSummary
  tickets: TicketType[]
  seatMap: SeatMap | null
  seatMapError: string
  calendar: CalendarLinks | null
  isAssignedMode: boolean
  assigned: boolean
  quantities: Record<string, number>
  setQuantity: (ticketId: string, quantity: number) => void
  seats: Seat[]
  toggleSeat: (seat: Seat) => void
  clearSeats: () => void
  seatSectionName: (seat: Seat) => string
  seatPrice: (seat: Seat) => number
  lines: SummaryLine[]
  subtotal: number
  hasSelection: boolean
  hasPaidTickets: boolean
  paidSalesReady: boolean
  promoCode: string
  setPromoCode: (value: string) => void
  quote: Quote | null
  name: string
  setName: (value: string) => void
  email: string
  setEmail: (value: string) => void
  order: Order | null
  busy: boolean
  error: string
  setError: (value: string) => void
  signedIn: boolean
  goTo: (step: Step) => void
  reserve: () => Promise<void>
  pay: (outcome: 'succeeded' | 'failed') => Promise<void>
  cancelReservation: () => Promise<void>
}

export const MAX_SEATS_PER_ORDER = 10
