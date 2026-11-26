import { Link } from 'react-router'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'
import { Logo } from './auth'

export function Footer() {
  const { user } = useAuth()
  const { t } = useLocale()
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const link = 'text-sm text-slate-500 transition hover:text-slate-900'

  return (
    <footer className="mt-auto bg-[#EAF0FD] print:hidden">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">{t('footer.tagline')}</p>
          </div>
          <nav aria-label={t('footer.product')}>
            <h2 className="text-sm font-bold text-slate-900">{t('footer.product')}</h2>
            <ul className="mt-4 space-y-3">
              <li><Link to="/events" className={link}>{t('footer.browse')}</Link></li>
              <li><Link to={isOrganizer ? '/events/new' : '/register?intent=organize'} className={link}>{t('events.create')}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t('footer.support')}>
            <h2 className="text-sm font-bold text-slate-900">{t('footer.support')}</h2>
            <ul className="mt-4 space-y-3">
              <li><Link to="/support" className={link}>{t('nav.help')}</Link></li>
              {user && <li><Link to="/orders" className={link}>{t('nav.tickets')}</Link></li>}
            </ul>
          </nav>
        </div>
        <p className="mt-12 border-t border-slate-400/60 pt-6 text-xs text-slate-500">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  )
}
