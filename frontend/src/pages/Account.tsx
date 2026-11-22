import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { deleteAccount, resendVerification, updateAccount } from '../api/auth'
import { buttonClass, inputClass } from '../components/form'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'

/** Account settings: email, password, verification email and account deletion (SRS 4.1). */
export default function Account() {
  const { user, updateUser, signOut } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [devToken, setDevToken] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [email, setEmail] = useState(user?.email ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')

  if (!user) return null

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const trimmedEmail = email.trim()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const saved = await updateAccount({
        currentPassword,
        email: trimmedEmail !== user!.email ? trimmedEmail : undefined,
        newPassword: newPassword || undefined,
      })
      updateUser({ email: saved.email, emailConfirmed: saved.emailConfirmed })
      setEmail(saved.email)
      setNewPassword('')
      setCurrentPassword('')
      setDevToken(saved.verificationToken ?? '')
      setMessage(saved.emailConfirmed ? t('account.updated') : t('account.updatedVerify'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('account.updateError'))
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
      setError(err instanceof Error ? err.message : t('account.resendError'))
    }
  }

  async function remove() {
    setError('')
    try {
      await deleteAccount()
      signOut()
      navigate('/events', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('account.deleteError'))
      setConfirmDelete(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header><p className="text-sm font-semibold text-indigo-600">{t('account.kicker')}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{t('account.title')}</h1><p className="mt-2 text-sm text-slate-500">{user.email} · {t(`role.${user.role}`)}</p></header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {devToken && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('account.devOnly')} <Link to={`/verify-email?token=${encodeURIComponent(devToken)}`} className="font-semibold underline">{t('account.devLink')}</Link>.</p>}

      {!user.emailConfirmed && (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">{t('account.unverifiedTitle')}</h2>
          <p className="text-sm text-amber-900">{t('account.unverifiedText')}</p>
          <button onClick={() => void resend()} className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">{t('account.resend')}</button>
        </section>
      )}

      <form onSubmit={(form) => void save(form)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">{t('account.credentials')}</h2>
        <label className="block text-sm font-medium">{t('form.email')}<input name="email" type="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm font-medium">{t('account.newPassword')}<input name="newPassword" type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm font-medium">{t('account.currentPassword')}<input name="currentPassword" type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <button disabled={busy} className={buttonClass}>{busy ? t('reset.submitting') : t('account.save')}</button>
      </form>

      <section className="space-y-3 rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-rose-800">{t('account.deleteTitle')}</h2>
        <p className="text-sm text-slate-600">{t('account.deleteText')}</p>
        {confirmDelete
          ? <div className="flex gap-2"><button onClick={() => void remove()} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">{t('account.deleteConfirm')}</button><button onClick={() => setConfirmDelete(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">{t('account.keep')}</button></div>
          : <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">{t('account.delete')}</button>}
      </section>
    </div>
  )
}
