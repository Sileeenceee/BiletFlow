import type { MessageKey } from '../../lib/i18n'

export const MANAGE_TABS = ['overview', 'tickets', 'attendees', 'orders', 'promotions', 'analytics', 'paid', 'history', 'team', 'support'] as const
export type ManageTab = typeof MANAGE_TABS[number] | 'edit'

export const TAB_LABELS: Record<ManageTab, MessageKey> = {
  overview: 'manage.tab.overview',
  tickets: 'manage.tab.tickets',
  attendees: 'manage.tab.attendees',
  orders: 'manage.tab.orders',
  promotions: 'manage.tab.promotions',
  analytics: 'manage.tab.analytics',
  paid: 'manage.tab.paid',
  history: 'manage.tab.history',
  team: 'manage.tab.team',
  support: 'manage.tab.support',
  edit: 'manage.tab.edit',
}

// Tab names from earlier versions of the page, still used by older links.
const LEGACY: Record<string, ManageTab> = { seating: 'tickets', campaigns: 'promotions' }

export function parseTab(value: string | null): ManageTab {
  if (!value) return 'overview'
  if (value === 'edit' || (MANAGE_TABS as readonly string[]).includes(value)) return value as ManageTab
  return LEGACY[value] ?? 'overview'
}
