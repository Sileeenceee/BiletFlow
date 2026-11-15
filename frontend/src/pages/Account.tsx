import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { deleteAccount, resendVerification, updateAccount } from '../api/auth'
import { buttonClass, inputClass } from '../components/form'
import { useAuth } from '../lib/auth'

/** Account settings: email, password, verification email and account deletion (SRS 4.1). */
export default function Account() {
  const { user, updateUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [devToken, setDevToken] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!user) return null

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const element = form.currentTarget
    const data = new FormData(element)
    const email = String(data.get('email')).trim()
    const newPassword = String(data.get('newPassword'))
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const saved = await updateAccount({
        currentPassword: String(data.get('currentPassword')),
        email: email !== user!.email ? email : undefined,
        newPassword: newPassword || undefined,
      })
      updateUser({ email: saved.email, emailConfirmed: saved.emailConfirmed })
      setDevToken(saved.verificationToken ?? '')
      setMessage(saved.emailConfirmed ? 'Account updated.' : 'Account updated. Verify your new email address to keep full access.')
      element.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the account.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError('')
    setMessage('')
    try {
      const result = await resendVerification(user!.email)
      setDevToken(result.verificationToken ?? '')
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the verification email.')
    }
  }

  async function remove() {
    setError('')
    try {
      await deleteAccount()
      signOut()
      navigate('/events', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.')
      setConfirmDelete(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header><p className="text-sm font-semibold text-indigo-600">Your account</p><h1 className="mt-1 text-3xl font-black tracking-tight">Account settings</h1><p className="mt-2 text-sm text-slate-500">{user.email} · {user.role}</p></header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {devToken && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Development only: <Link to={`/verify-email?token=${encodeURIComponent(devToken)}`} className="font-semibold underline">open the verification link</Link>.</p>}

      {!user.emailConfirmed && (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">Email not verified</h2>
          <p className="text-sm text-amber-900">Verify your address to receive tickets and be assigned as event staff.</p>
          <button onClick={() => void resend()} className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">Resend verification email</button>
        </section>
      )}

      <form onSubmit={(form) => void save(form)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Email and password</h2>
        <label className="block text-sm font-medium">Email<input name="email" type="email" required maxLength={320} defaultValue={user.email} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm font-medium">New password (leave empty to keep the current one)<input name="newPassword" type="password" minLength={8} autoComplete="new-password" className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm font-medium">Current password<input name="currentPassword" type="password" required autoComplete="current-password" className={`${inputClass} mt-1.5`} /></label>
        <button disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>

      <section className="space-y-3 rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-rose-800">Delete account</h2>
        <p className="text-sm text-slate-600">This cannot be undone. Accounts that still own events or orders which must be retained cannot be deleted.</p>
        {confirmDelete
          ? <div className="flex gap-2"><button onClick={() => void remove()} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">Yes, delete my account</button><button onClick={() => setConfirmDelete(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Keep account</button></div>
          : <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">Delete account…</button>}
      </section>
    </div>
  )
}
