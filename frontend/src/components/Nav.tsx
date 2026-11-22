import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { getNotifications } from '../api/workflows'
import { useAuth } from '../lib/auth'
import { locales, useLocale, type Locale } from '../lib/i18n'

export function Nav() {
  const { user, signOut } = useAuth()
  const { locale, setLocale, t } = useLocale()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`

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

  const languagePicker = (
    <select aria-label={t('nav.language')} value={locale} onChange={(event) => setLocale(event.target.value as Locale)} className="rounded-full border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700">
      {locales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
    </select>
  )

  return (
    <>
      <nav className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
          <Link to="/events" className="mr-3 flex items-center gap-2 text-lg font-black tracking-tight text-slate-950">
            <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-sm text-white">B</span>
            BiletFlow
          </Link>
          {user && (
            <div className="flex flex-wrap items-center gap-1">
              <NavLink to="/events" end className={linkClass}>{t('nav.explore')}</NavLink>
              {(user.role === 'Attendee' || user.role === 'EventAdmin') && <NavLink to="/orders" className={linkClass}>{t('nav.tickets')}</NavLink>}
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
              {languagePicker}
              <Link to="/account" className="text-right hover:underline" aria-label={t('nav.account')}>
                <span className="text-xs font-semibold text-slate-700 sm:hidden">{t('nav.account')}</span>
                <span className="hidden sm:block font-semibold text-slate-800">{user.email}</span>
                <span className="hidden sm:block text-xs text-slate-500">{user.role}</span>
              </Link>
              <button onClick={signOut} className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50">
                {t('nav.signOut')}
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-3 text-sm">
              {languagePicker}
              <Link to="/login" className="font-semibold text-slate-700">{t('nav.signIn')}</Link>
              <Link to="/register" className="rounded-full bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700">{t('nav.register')}</Link>
            </div>
          )}
        </div>
      </nav>

      {user && !user.emailConfirmed && (
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
