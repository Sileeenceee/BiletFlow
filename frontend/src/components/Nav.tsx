import { Link, NavLink } from 'react-router'
import { useAuth } from '../lib/auth'

export function Nav() {
  const { user, signOut } = useAuth()
  const isOrganizer = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`

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
              <NavLink to="/events" className={linkClass}>Explore</NavLink>
              {user.role === 'Attendee' && <NavLink to="/orders" className={linkClass}>My tickets</NavLink>}
              {isOrganizer && <NavLink to="/events/new" className={linkClass}>Create event</NavLink>}
              {isOrganizer && <NavLink to="/organizer/profile" className={linkClass}>Organizer profile</NavLink>}
              {user.role === 'EventAdmin' &&
                <NavLink to="/event-admin" className={linkClass}>Check-in</NavLink>}
              <NavLink to="/support" className={linkClass}>Support</NavLink>
            </div>
          )}
          {user ? (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="hidden text-right sm:block">
                <span className="block font-semibold text-slate-800">{user.email}</span>
                <span className="block text-xs text-slate-500">{user.role}</span>
              </span>
              <button onClick={signOut} className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50">
                Sign out
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Link to="/login" className="font-semibold text-slate-700">Sign in</Link>
              <Link to="/register" className="rounded-full bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700">Create account</Link>
            </div>
          )}
        </div>
      </nav>

      {user && !user.emailConfirmed && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          Your email is not verified.{' '}
          <Link to="/verify-email" className="font-semibold underline">
            Verify it now
          </Link>
        </div>
      )}
    </>
  )
}
