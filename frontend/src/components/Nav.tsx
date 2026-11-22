import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { getNotifications } from '../api/workflows'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'
import { LanguageSwitch, Logo } from './auth'

export function Nav() {
  const { user, signOut } = useAuth()
  const { t } = useLocale()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`

  // Refreshed on navigation and once a minute; the API has no push channel (SRS 4.13).
  useEffect(() => {
    if (!user) return
    let active = true
    const load = () => getNotifications()
      .then((items) => { if (active) setUnread(items.filter((item) => !item.readAt).length) })
      .catch(() => undefined)
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [user, location.pathname])

  const publicLink = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2 py-1 text-[15px] transition ${isActive ? 'text-slate-950' : 'text-slate-700 hover:text-slate-950'}`

  return (
    <>
      <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <Logo className="mr-6" />
          {!user && (
            <div className="hidden items-center gap-6 md:flex">
              <NavLink to="/events" end className={publicLink}>{t('nav.events')}</NavLink>
              <Link to="/register?intent=organize" className={publicLink({ isActive: false })}>{t('nav.forOrganizers')}</Link>
              <NavLink to="/support" className={publicLink}>{t('nav.help')}</NavLink>
            </div>
          )}
          {user && (
            <div className="flex flex-wrap items-center gap-1">
              <NavLink to="/events" end className={linkClass}>{t('nav.explore')}</NavLink>
              {user.role === 'Attendee' && <NavLink to="/orders" className={linkClass}>{t('nav.tickets')}</NavLink>}
              {isOrganizer && <NavLink to="/organizer/dashboard" className={linkClass}>{t('nav.dashboard')}</NavLink>}
              {isOrganizer && <NavLink to="/events/new" className={linkClass}>{t('nav.create')}</NavLink>}
              {isOrganizer && <NavLink to="/organizer/profile" className={linkClass}>{t('nav.profile')}</NavLink>}
              {user.role === 'EventAdmin' &&
                <NavLink to="/event-admin" className={linkClass}>{t('nav.checkin')}</NavLink>}
              {user.role === 'PlatformAdmin' && <NavLink to="/admin" className={linkClass}>{t('nav.admin')}</NavLink>}
              <NavLink to="/support" className={linkClass}>{t('nav.support')}</NavLink>
              <NavLink to="/notifications" className={linkClass}>
                {t('nav.notifications')}
                {unread > 0 && <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
              </NavLink>
            </div>
          )}
          {user ? (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <LanguageSwitch />
              <Link to="/account" className="hidden text-right hover:underline sm:block" aria-label={t('nav.account')}>
                <span className="block font-semibold text-slate-800">{user.email}</span>
                <span className="block text-xs text-slate-500">{user.role}</span>
              </Link>
              <button onClick={signOut} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-800 transition hover:bg-slate-50">
                {t('nav.signOut')}
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-2 text-sm sm:gap-3 sm:text-[15px]">
              <LanguageSwitch />
              <Link to="/login" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 sm:h-10 sm:px-6 font-semibold text-slate-900 transition hover:bg-slate-50">{t('nav.logIn')}</Link>
              <Link to="/register" className="inline-flex h-9 items-center whitespace-nowrap rounded-lg bg-brand-500 px-3 sm:h-10 sm:px-6 font-semibold text-white transition hover:bg-brand-600">{t('nav.signUp')}</Link>
            </div>
          )}
        </div>
      </nav>

      {user && !user.emailConfirmed && location.pathname !== '/verify-email' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          {t('nav.unverified')}{' '}
          <Link to="/account" className="font-semibold underline">
            {t('nav.verifyNow')}
          </Link>
        </div>
      )}
    </>
  )
}
