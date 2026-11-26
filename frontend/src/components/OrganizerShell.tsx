import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, matchPath, NavLink, useLocation } from 'react-router'
import { getOrganizerProfile } from '../api/workflows'
import { useAuth } from '../lib/auth'
import { useLocale, type MessageKey } from '../lib/i18n'
import { LanguageSwitch, Logo } from './auth'
import { CalendarIcon, ChatIcon, ChevronDownIcon, ClockIcon, HomeIcon, MenuIcon, PlusIcon, SettingsIcon, ShieldIcon, TicketIcon, UsersIcon } from './icons'
import { NotificationBell } from './NotificationBell'

type Item = { to: string; label: MessageKey; Icon: typeof HomeIcon; end?: boolean }

// Page title in the top bar, by route; the first match wins.
const titles: [string, MessageKey][] = [
  ['/organizer/dashboard', 'nav.dashboard'],
  ['/organizer/profile', 'shell.profile'],
  ['/organizer/admins', 'manage.tab.team'],
  ['/organizer/history', 'history.pageTitle'],
  ['/events/new', 'events.create'],
  ['/events/:eventId/setup', 'events.create'],
  ['/events/:eventId/manage', 'shell.manageEvent'],
  ['/events', 'shell.myEvents'],
  ['/support', 'nav.support'],
  ['/notifications', 'nav.notifications'],
  ['/account', 'nav.account'],
  ['/admin/moderation', 'admin.nav.moderation'],
  ['/admin/paid-sales', 'admin.nav.paidSales'],
  ['/admin/settings', 'admin.nav.settings'],
  ['/admin/support', 'admin.nav.support'],
  ['/admin', 'admin.nav.overview'],
]

/** App shell for organizers and platform admins: left sidebar and a top bar (design 04 Organizer). */
export function OrganizerShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { t } = useLocale()
  const location = useLocation()
  const [name, setName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPath, setLastPath] = useState(location.pathname)
  const menuRef = useRef<HTMLDivElement>(null)

  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
    setDrawerOpen(false)
  }

  useEffect(() => {
    if (user?.role !== 'Organizer') return
    let active = true
    getOrganizerProfile()
      .then((profile) => { if (active) setName(profile.displayName || profile.businessName) })
      .catch(() => undefined)
    return () => { active = false }
  }, [user?.role])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [menuOpen])

  if (!user) return <>{children}</>
  const displayName = name || user.email.split('@')[0]
  const initials = displayName.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
  const title = titles.find(([pattern]) => matchPath({ path: pattern, end: true }, location.pathname))?.[1]

  // Platform admins get the admin sections first (design 03), then the organizer tools they can also use.
  const adminItems: Item[] = user.role === 'PlatformAdmin' ? [
    { to: '/admin', label: 'admin.nav.overview', Icon: HomeIcon, end: true },
    { to: '/admin/moderation', label: 'admin.nav.moderation', Icon: ShieldIcon },
    { to: '/admin/paid-sales', label: 'admin.nav.paidSales', Icon: TicketIcon },
    { to: '/admin/settings', label: 'admin.nav.settings', Icon: SettingsIcon },
    { to: '/admin/support', label: 'admin.nav.support', Icon: ChatIcon },
  ] : []
  const items: Item[] = [
    { to: '/organizer/dashboard', label: 'nav.dashboard', Icon: HomeIcon },
    { to: '/events', label: 'shell.myEvents', Icon: CalendarIcon, end: true },
    { to: '/events/new', label: 'events.create', Icon: PlusIcon },
    { to: '/organizer/admins', label: 'manage.tab.team', Icon: UsersIcon },
    { to: '/support', label: 'nav.support', Icon: ChatIcon },
    { to: '/organizer/history', label: 'history.pageTitle', Icon: ClockIcon },
    { to: '/organizer/profile', label: 'shell.profile', Icon: SettingsIcon },
  ]
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] transition ${isActive ? 'bg-[#EEF3FE] font-bold text-brand-500' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'}`

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center border-b border-slate-200 px-6"><Logo /></div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <span className={`ml-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${user.role === 'PlatformAdmin' ? 'bg-accent text-slate-900' : 'bg-[#DCE6FD] text-[#2B4BB5]'}`}>{t(`role.${user.role}`)}</span>
        <nav aria-label={t('shell.menu')} className="mt-4 space-y-1">
          {adminItems.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={link}><Icon className="size-5" />{t(label)}</NavLink>)}
          {adminItems.length > 0 && <p className="px-4 pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-slate-400">{t('shell.organizerTools')}</p>}
          {items.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={link}><Icon className="size-5" />{t(label)}</NavLink>)}
        </nav>
      </div>
      <Link to={user.role === 'Organizer' ? '/organizer/profile' : '/account'} className="m-3 flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#DCE6FD] text-sm font-bold text-[#2B4BB5]">{initials}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">{displayName}</span>
          <span className="block text-xs text-slate-500">{t(`role.${user.role}`)}</span>
        </span>
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-canvas lg:pl-[260px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-slate-200 bg-white lg:block print:hidden">{sidebar}</aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button type="button" aria-label={t('common.close')} onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-slate-900/40" />
          <aside className="relative h-full w-[280px] bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-8 print:hidden">
        <button type="button" aria-label={t('nav.menu')} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden">
          <MenuIcon className="size-6" />
        </button>
        <p className="truncate font-display text-xl font-bold text-slate-900 sm:text-[23px]">{title ? t(title) : ''}</p>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:block"><LanguageSwitch /></div>
          <NotificationBell />
          <div ref={menuRef} className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100">
              <span className="grid size-9 place-items-center rounded-full bg-[#DCE6FD] text-sm font-bold text-[#2B4BB5]">{initials}</span>
              <span className="hidden text-sm font-bold text-slate-900 sm:inline">{t('nav.account')}</span>
              <ChevronDownIcon className="size-4 text-slate-500" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                <p className="truncate px-3 pb-2 pt-1 text-xs text-slate-500">{user.email}</p>
                <NavLink role="menuitem" to="/account" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{t('nav.account')}</NavLink>
                <NavLink role="menuitem" to="/notifications" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{t('nav.notifications')}</NavLink>
                <NavLink role="menuitem" to="/" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{t('shell.publicSite')}</NavLink>
                <div className="px-3 py-2 sm:hidden"><LanguageSwitch /></div>
                <button type="button" role="menuitem" onClick={signOut} className="mt-1 block w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm font-bold text-[#B91C1C] hover:bg-rose-50">{t('nav.signOut')}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {user && !user.emailConfirmed && location.pathname !== '/verify-email' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950 print:hidden">
          {t('nav.unverified')} <Link to="/account" className="font-semibold underline">{t('nav.verifyNow')}</Link>
        </div>
      )}

      <main className="px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  )
}

