import { BrowserRouter, matchPath, Outlet, Route, Routes, useLocation } from 'react-router'
import { Footer } from './components/Footer'
import { Nav } from './components/Nav'
import { OrganizerShell } from './components/OrganizerShell'
import { useAuth } from './lib/auth'
import { AuthProvider } from './lib/auth'
import { LocaleProvider } from './lib/i18n'
import { RequireAuth } from './lib/RequireAuth'
import Account from './pages/Account'
import Admin from './pages/Admin'
import CreateEvent from './pages/CreateEvent'
import EventAdmin from './pages/EventAdmin'
import EventDetail from './pages/EventDetail'
import EventSetup from './pages/EventSetup'
import Events from './pages/Events'
import ForgotPassword from './pages/ForgotPassword'
import Home from './pages/Home'
import Login from './pages/Login'
import ManageEvent from './pages/ManageEvent'
import NotFound from './pages/NotFound'
import Notifications from './pages/Notifications'
import OrganizerAdmins from './pages/OrganizerAdmins'
import OrganizerDashboard from './pages/OrganizerDashboard'
import OrganizerHistory from './pages/OrganizerHistory'
import Orders from './pages/Orders'
import OrganizerProfile from './pages/OrganizerProfile'
import CampaignRedirect from './pages/CampaignRedirect'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import TicketDetail from './pages/TicketDetail'
import Support from './pages/Support'
import VerifyEmail from './pages/VerifyEmail'

// Organizers and platform admins see these pages inside the organizer shell instead of the public site.
const WORKSPACE_PATHS = ['/organizer/*', '/events', '/events/new', '/events/:eventId/manage', '/events/:eventId/setup', '/support', '/notifications', '/account', '/admin', '/admin/*']

/** Every page except the full-screen log-in page shares the nav bar and footer. */
function SiteLayout({ fullBleed = false }: { fullBleed?: boolean }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const staff = user?.role === 'Organizer' || user?.role === 'PlatformAdmin'
  if (staff && WORKSPACE_PATHS.some((path) => matchPath(path, pathname))) {
    return <OrganizerShell><Outlet /></OrganizerShell>
  }
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className={fullBleed ? 'w-full' : 'mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8'}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <LocaleProvider>
      <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<SiteLayout fullBleed />}>
              <Route path="/" element={<Home />} />
              <Route path="/events/:eventId" element={<EventDetail />} />
            </Route>

            <Route element={<SiteLayout />}>

            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/events" element={<Events />} />

            <Route path="/campaign/:token" element={<CampaignRedirect />} />

            <Route
              path="/events/new"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <CreateEvent />
                </RequireAuth>
              }
            />

            <Route
              path="/events/:eventId/setup"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <EventSetup />
                </RequireAuth>
              }
            />

            <Route
              path="/events/:eventId/manage"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <ManageEvent />
                </RequireAuth>
              }
            />

            <Route
              path="/organizer/profile"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <OrganizerProfile />
                </RequireAuth>
              }
            />

            <Route
              path="/organizer/admins"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <OrganizerAdmins />
                </RequireAuth>
              }
            />

            <Route
              path="/organizer/history"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <OrganizerHistory />
                </RequireAuth>
              }
            />

            <Route
              path="/organizer/dashboard"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <OrganizerDashboard />
                </RequireAuth>
              }
            />

            {['/admin', '/admin/:section'].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireAuth roles={['PlatformAdmin']}>
                    <Admin />
                  </RequireAuth>
                }
              />
            ))}

            <Route
              path="/notifications"
              element={
                <RequireAuth>
                  <Notifications />
                </RequireAuth>
              }
            />

            <Route
              path="/account"
              element={
                <RequireAuth>
                  <Account />
                </RequireAuth>
              }
            />

            <Route
              path="/orders"
              element={
                <RequireAuth>
                  <Orders />
                </RequireAuth>
              }
            />

            <Route
              path="/tickets/:ticketId"
              element={
                <RequireAuth>
                  <TicketDetail />
                </RequireAuth>
              }
            />

            <Route
              path="/event-admin"
              element={
                <RequireAuth roles={['EventAdmin']}>
                  <EventAdmin />
                </RequireAuth>
              }
            />

            <Route
              path="/support"
              element={
                <RequireAuth>
                  <Support />
                </RequireAuth>
              }
            />

            <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
      </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  )
}
