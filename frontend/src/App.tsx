import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Nav } from './components/Nav'
import { AuthProvider } from './lib/auth'
import { RequireAuth } from './lib/RequireAuth'
import CreateEvent from './pages/CreateEvent'
import Events from './pages/Events'
import ForgotPassword from './pages/ForgotPassword'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <main className="p-4">
          <Routes>
            <Route path="/" element={<Navigate to="/events" replace />} />

            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route
              path="/events"
              element={
                <RequireAuth>
                  <Events />
                </RequireAuth>
              }
            />

            <Route
              path="/events/new"
              element={
                <RequireAuth roles={['Organizer', 'PlatformAdmin']}>
                  <CreateEvent />
                </RequireAuth>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  )
}
