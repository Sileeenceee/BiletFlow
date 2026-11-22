import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { getCurrentUser, resendVerification, verifyEmail } from '../api/auth'
import { AuthCard, CheckIcon, DevLink, FormError, MailIcon, SuccessNote, linkClass, primaryButtonClass, secondaryButtonClass } from '../components/auth'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'

type Status = 'idle' | 'working' | 'done' | 'failed'

/** Webmail inboxes for common providers; anything else falls back to the mail client. */
const webmail: Record<string, string> = {
  'gmail.com': 'https://mail.google.com/',
  'googlemail.com': 'https://mail.google.com/',
  'outlook.com': 'https://outlook.live.com/mail/',
  'hotmail.com': 'https://outlook.live.com/mail/',
  'live.com': 'https://outlook.live.com/mail/',
  'yahoo.com': 'https://mail.yahoo.com/',
  'icloud.com': 'https://www.icloud.com/mail',
  'yandex.ru': 'https://mail.yandex.ru/',
  'yandex.kz': 'https://mail.yandex.kz/',
  'ya.ru': 'https://mail.yandex.ru/',
  'mail.ru': 'https://e.mail.ru/',
  'inbox.ru': 'https://e.mail.ru/',
  'list.ru': 'https://e.mail.ru/',
  'bk.ru': 'https://e.mail.ru/',
}

function inboxUrl(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return webmail[domain] ?? 'mailto:'
}

function EnvelopeBadge() {
  return (
    <div className="mx-auto grid size-[88px] place-items-center rounded-full bg-cyan-100">
      <MailIcon className="size-11 text-cyan-700" />
    </div>
  )
}

export default function VerifyEmail() {
  const { t } = useLocale()
  const { user, updateUser } = useAuth()
  const [params] = useSearchParams()
  const location = useLocation()
  const token = params.get('token')
  const email = params.get('email') ?? user?.email ?? ''

  const [status, setStatus] = useState<Status>(token ? 'working' : 'idle')
  const [message, setMessage] = useState('')
  const [resend, setResend] = useState<'idle' | 'working' | 'sent'>('idle')
  const [devToken, setDevToken] = useState<string | null>(
    (location.state as { devToken?: string | null } | null)?.devToken ?? null,
  )
  const autoRan = useRef(false)

  async function submit(value: string) {
    setStatus('working')
    setMessage('')
    try {
      const res = await verifyEmail(value)
      setMessage(res.message)
      setStatus('done')
      // The "email is not verified" banner reads the user stored at sign-in; refresh it.
      if (user) {
        try {
          const me = await getCurrentUser()
          updateUser({ emailConfirmed: me.emailConfirmed })
        } catch {
          // Verification itself succeeded; the banner clears at the next sign-in.
        }
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('auth.genericError'))
      setStatus('failed')
    }
  }

  // Verify automatically when arriving with ?token=…, but only once —
  // StrictMode runs effects twice in development and the token is single-use.
  useEffect(() => {
    if (token && !autoRan.current) {
      autoRan.current = true
      void submit(token)
    }
  }, [token])

  async function onResend() {
    if (!email) return
    setResend('working')
    setMessage('')
    try {
      const res = await resendVerification(email)
      setDevToken(res.verificationToken)
      setResend('sent')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('auth.genericError'))
      setResend('idle')
    }
  }

  if (status === 'working') {
    return (
      <AuthCard className="mx-auto max-w-[500px] text-center">
        <EnvelopeBadge />
        <p role="status" className="mt-6 text-[15px] text-slate-600">
          {t('auth.verifying')}
        </p>
      </AuthCard>
    )
  }

  if (status === 'done') {
    return (
      <AuthCard className="mx-auto max-w-[500px] text-center">
        <div className="mx-auto grid size-[88px] place-items-center rounded-full bg-green-100">
          <CheckIcon className="size-10 text-green-700" />
        </div>
        <h1 className="mt-6 font-display text-[28px] font-bold text-slate-900 sm:text-[32px]">{t('auth.verifiedTitle')}</h1>
        <p role="status" className="mt-3 text-[15px] text-slate-600">
          {message}
        </p>
        <Link to="/events" className={`${primaryButtonClass} mt-8`}>
          {t('auth.continue')}
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard className="mx-auto max-w-[500px]">
      <EnvelopeBadge />
      <h1 className="mt-6 text-center font-display text-[28px] font-bold text-slate-900 sm:text-[32px]">
        {status === 'failed' ? t('auth.verifyFailedTitle') : t('auth.inboxTitle')}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
        {email ? t('auth.inboxText', { email }) : t('auth.inboxTextNoEmail')}
      </p>

      <div className="mt-5 space-y-3">
        {message && <FormError message={message} />}
        {resend === 'sent' && <SuccessNote title={t('auth.resent')} />}

        <a href={inboxUrl(email)} target="_blank" rel="noreferrer" className={primaryButtonClass}>
          {t('auth.openEmail')}
        </a>
        {email && (
          <button type="button" onClick={onResend} disabled={resend === 'working'} className={secondaryButtonClass}>
            {resend === 'working' ? t('auth.resending') : t('auth.resend')}
          </button>
        )}
      </div>

      <p className="mt-5 text-center text-sm">
        <Link to={user ? '/account' : '/register'} className={linkClass}>
          {t('auth.changeEmail')}
        </Link>
      </p>

      {devToken && (
        <div className="mt-6">
          <DevLink
            to={`/verify-email?token=${encodeURIComponent(devToken)}`}
            text={t('auth.devLink')}
            label={t('auth.verifyLink')}
          />
        </div>
      )}
    </AuthCard>
  )
}
