import type { EventSummary } from '../../api/events'

/** What every Manage event tab receives from the screen that hosts it. */
export type TabProps = {
  event: EventSummary
  onEvent: (event: EventSummary) => void
  onError: (message: string) => void
  onMessage: (message: string) => void
}
