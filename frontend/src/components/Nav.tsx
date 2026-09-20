import { Link } from 'react-router'
import { useAuth } from '../lib/auth'

export function Nav() {
  const { user, signOut } = useAuth()

  return (
    <>
      <nav className="flex flex-wrap gap-4 items-center p-4 border-b">
        <Link to="/events" className="font-semibold">
          BiletFlow
        </Link>

        {(user?.role === 'Organizer' || user?.role === 'PlatformAdmin') && (
          <Link to="/events/new">Create event</Link>
        )}

        {user ? (
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              {user.email} · {user.role}
            </span>
            <button onClick={signOut} className="underline">
              Sign out
            </button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create account</Link>
          </div>
        )}
      </nav>

      {user && !user.emailConfirmed && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm">
          Your email is not verified.{' '}
          <Link to="/verify-email" className="underline">
            Verify it now
          </Link>
        </div>
      )}
    </>
  )
}
