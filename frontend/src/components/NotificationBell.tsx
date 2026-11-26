import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { getNotifications } from '../api/workflows'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'
import { BellIcon } from './icons'

/** Bell with the unread count; refreshed on navigation and once a minute (the API has no push channel, SRS 4.13). */
export function NotificationBell() {
  const { user } = useAuth()
  const { t } = useLocale()
  const location = useLocation()
  const [unread, setUnread] = useState(0)

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

  return (
    <Link to="/notifications" aria-label={unread > 0 ? t('nav.notificationsUnread', { count: unread }) : t('nav.notifications')} className="relative grid size-10 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100">
      <BellIcon className="size-6" />
      {unread > 0 && <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-[#B91C1C] px-1 text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  )
}
