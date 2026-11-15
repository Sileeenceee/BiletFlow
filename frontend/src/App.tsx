import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Nav } from './components/Nav'
import { AuthProvider } from './lib/auth'
import { LocaleProvider } from './lib/i18n'
import { RequireAuth } from './lib/RequireAuth'
import Account from './pages/Account'
import Admin from './pages/Admin'
import CreateEvent from './pages/CreateEvent'
import EventAdmin from './pages/EventAdmin'
import EventDetail from './pages/EventDetail'
import Events from './pages/Events'
import ForgotPassword from './pages/ForgotPassword'
import Login from './pages/Login'
import ManageEvent from './pages/ManageEvent'
import NotFound from './pages/NotFound'
import Notifications from './pages/Notifications'
import OrganizerDashboard from './pages/OrganizerDashboard'
import Orders from './pages/Orders'
import OrganizerProfile from './pages/OrganizerProfile'
import CampaignRedirect from './pages/CampaignRedirect'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Support from './pages/Support'
import VerifyEmail from './pages/VerifyEmail'

export default function App() {
  return (
    <BrowserRouter>
      <LocaleProvider>
      <AuthProvider>
        <Nav />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Navigate to="/events" replace />} />

            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/events" element={<Events />} />

            <Route path="/events/:eventId" element={<EventDetail />} />
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
              path="/organizer/dashboard"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <OrganizerDashboard />
                </RequireAuth>
              }
            />

            <Route
              path="/admin"
              element={
                <RequireAuth roles={['PlatformAdmin']}>
                  <Admin />
                </RequireAuth>
              }
            />

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
          </Routes>
        </main>
      </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  )
}
