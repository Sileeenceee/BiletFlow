import { NavLink } from 'react-router'
import { useAuth } from '../lib/auth'
import { useLocale, type MessageKey } from '../lib/i18n'
import { ChatIcon, ListIcon, TicketIcon, UserIcon } from './icons'

/** Left-hand account menu from the design's My tickets screen. */
export function AccountNav() {
  const { user } = useAuth()
  const { t } = useLocale()
  if (!user) return null
  const name = user.email.split('@')[0]
  const initials = name.split(/[._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
  const links: { to: string; label: MessageKey; Icon: typeof TicketIcon; end?: boolean }[] = [
    { to: '/orders', label: 'nav.tickets', Icon: TicketIcon, end: true },
    { to: '/orders#orders', label: 'account.orders', Icon: ListIcon },
    { to: '/support', label: 'account.supportCases', Icon: ChatIcon },
    { to: '/account', label: 'account.profile', Icon: UserIcon },
  ]
  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-24">
      <div className="flex items-center gap-3 px-2 pb-3 pt-2">
        <span className="grid size-12 place-items-center rounded-full bg-[#CFFAFE] text-lg font-bold text-[#164E63]">{initials}</span>
        <span className="min-w-0">
          <span className="block truncate font-bold text-slate-900">{name}</span>
          <span className="block text-xs text-slate-500">{t(`role.${user.role}`)}</span>
        </span>
      </div>
      <nav aria-label={t('account.menu')} className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:block lg:space-y-1">
        {links.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition ${isActive && !to.includes('#') ? 'bg-[#EEF3FE] font-bold text-brand-500' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <Icon className="size-5" />{t(label)}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
