import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useAuth } from '../lib/auth'
import { useLocale, type MessageKey } from '../lib/i18n'
import { LanguageSwitch, Logo } from './auth'
import { ChevronDownIcon, MenuIcon } from './icons'
import { NotificationBell } from './NotificationBell'

type MenuLink = { to: string; label: MessageKey }

export function Nav() {
  const { user, signOut } = useAuth()
  const { t } = useLocale()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lastPath, setLastPath] = useState(location.pathname)
  const menuRef = useRef<HTMLDivElement>(null)
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'

  // Close the menus whenever the page changes.
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
    setMobileOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [menuOpen])

  // The bar keeps the design's three public links; role pages live in the account menu.
  const primary: MenuLink[] = [
    { to: '/events', label: 'nav.events' },
    ...(!user ? [{ to: '/register?intent=organize', label: 'nav.forOrganizers' } as MenuLink] : []),
    ...(user?.role === 'Attendee' ? [{ to: '/orders', label: 'nav.tickets' } as MenuLink] : []),
    ...(user?.role === 'EventAdmin' ? [{ to: '/event-admin', label: 'nav.checkin' } as MenuLink] : []),
    ...(isOrganizer ? [{ to: '/organizer/dashboard', label: 'nav.dashboard' } as MenuLink] : []),
    ...(user?.role === 'PlatformAdmin' ? [{ to: '/admin', label: 'nav.admin' } as MenuLink] : []),
    { to: '/support', label: user ? 'nav.support' : 'nav.help' },
  ]
  const account: MenuLink[] = user ? [
    ...(user.role !== 'Organizer' && user.role !== 'PlatformAdmin' ? [{ to: '/orders', label: 'nav.tickets' } as MenuLink] : []),
    ...(user.role === 'EventAdmin' ? [{ to: '/event-admin', label: 'nav.checkin' } as MenuLink] : []),
    ...(isOrganizer ? [
      { to: '/organizer/dashboard', label: 'nav.dashboard' } as MenuLink,
      { to: '/events/new', label: 'nav.create' } as MenuLink,
      { to: '/organizer/profile', label: 'nav.profile' } as MenuLink,
    ] : []),
    ...(user.role === 'PlatformAdmin' ? [{ to: '/admin', label: 'nav.admin' } as MenuLink] : []),
    { to: '/support', label: 'nav.support' },
    { to: '/notifications', label: 'nav.notifications' },
    { to: '/account', label: 'nav.account' },
  ] : []

  const barLink = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 py-1 text-[15px] transition ${isActive ? 'border-brand-500 font-semibold text-brand-500' : 'border-transparent text-slate-700 hover:text-slate-950'}`
  const menuLink = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-[#EEF3FE] font-bold text-brand-500' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'}`
  const name = user ? user.email.split('@')[0] : ''
  const initials = name.split(/[._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'

  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
          <Logo className="mr-4 shrink-0" />
          <div className="hidden items-center gap-8 lg:flex">
            {primary.map((link) => {
              // Links with a query (For organizers) are active only when the query matches too.
              const [path, query] = link.to.split('?')
              const custom = query ? location.pathname === path && location.search.includes(query) : undefined
              return <NavLink key={link.to} to={link.to} end={link.to === '/events'} className={({ isActive }) => barLink({ isActive: custom ?? isActive })}>{t(link.label)}</NavLink>
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:block"><LanguageSwitch /></div>
            {user ? (
              <>
                <NotificationBell />
                <div ref={menuRef} className="relative hidden lg:block">
                  <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100">
                    <span className="grid size-9 place-items-center rounded-full bg-[#CFFAFE] text-sm font-bold text-[#164E63]">{initials}</span>
                    <span className="max-w-40 text-left">
                      <span className="block truncate text-sm font-bold text-slate-900">{name}</span>
                      <span className="block text-xs text-slate-500">{t(`role.${user.role}`)}</span>
                    </span>
                    <ChevronDownIcon className="size-4 text-slate-500" />
                  </button>
                  {menuOpen && (
                    <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                      <p className="truncate px-3 pb-2 pt-1 text-xs text-slate-500">{user.email}</p>
                      {account.map((link) => <NavLink key={link.to} role="menuitem" to={link.to} className={menuLink}>{t(link.label)}</NavLink>)}
                      <button type="button" role="menuitem" onClick={signOut} className="mt-1 block w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm font-bold text-[#B91C1C] hover:bg-rose-50">{t('nav.signOut')}</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 sm:h-10 sm:px-6 sm:text-[15px]">{t('nav.logIn')}</Link>
                <Link to="/register" className="hidden h-10 items-center whitespace-nowrap rounded-lg bg-brand-500 px-6 text-[15px] font-semibold text-white transition hover:bg-brand-600 sm:inline-flex">{t('nav.signUp')}</Link>
              </>
            )}
            <button type="button" aria-label={t('nav.menu')} aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)} className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden">
              <MenuIcon className="size-6" />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 lg:hidden">
            {user && <p className="truncate px-3 py-2 text-xs text-slate-500">{user.email} · {t(`role.${user.role}`)}</p>}
            {[...primary, ...account.filter((link) => !primary.some((item) => item.to === link.to))].map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/events'} className={menuLink}>{t(link.label)}</NavLink>
            ))}
            {!user && <NavLink to="/register" className={menuLink}>{t('nav.signUp')}</NavLink>}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 px-3 pt-3">
              <LanguageSwitch />
              {user && <button type="button" onClick={signOut} className="text-sm font-bold text-[#B91C1C]">{t('nav.signOut')}</button>}
            </div>
          </div>
        )}
      </nav>

      {user && !user.emailConfirmed && location.pathname !== '/verify-email' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950 print:hidden">
          {t('nav.unverified')}{' '}
          <Link to="/account" className="font-semibold underline">
            {t('nav.verifyNow')}
          </Link>
        </div>
      )}
    </>
  )
}
