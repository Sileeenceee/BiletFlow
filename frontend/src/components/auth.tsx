import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router'
import logo from '../assets/logo.png'
import { locales, useLocale } from '../lib/i18n'

/* Building blocks for the authentication screens (design: 01 Authentication). */

export const primaryButtonClass =
  'inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-[15px] font-semibold text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60'
export const secondaryButtonClass =
  'inline-flex h-12 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100'
export const linkClass = 'font-semibold text-brand-500 hover:text-brand-700 hover:underline'

const shortLabels = { kk: 'ҚАЗ', ru: 'РУС', en: 'ENG' } as const

export function Logo({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`}>
      <img src={logo} alt="" className="size-[34px]" />
      <span className={`font-display text-[22px] font-bold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
        BiletFlow
      </span>
    </Link>
  )
}

export function LanguageSwitch() {
  const { locale, setLocale, t } = useLocale()
  return (
    <div role="group" aria-label={t('nav.language')} className="flex rounded-lg bg-slate-100 p-1">
      {locales.map((item) => (
        <button
          key={item.code}
          type="button"
          lang={item.code}
          title={item.label}
          aria-pressed={locale === item.code}
          onClick={() => setLocale(item.code)}
          className={`rounded-md px-2.5 py-1 text-xs transition ${
            locale === item.code ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {shortLabels[item.code]}
        </button>
      ))}
    </div>
  )
}

export function AuthCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 ${className}`}>{children}</div>
  )
}

export function AuthHeading({ title, subtitle, center = false }: { title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={center ? 'text-center' : ''}>
      <h1 className="font-display text-[28px] font-bold leading-tight text-slate-900 sm:text-[32px]">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-slate-600">{subtitle}</p>}
    </div>
  )
}

type AuthFieldProps = {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

export function AuthField({ id, label, error, hint, children }: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-slate-900">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}

const fieldShell =
  'flex h-11 items-center gap-2.5 rounded-lg border bg-white px-3.5 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100'
const bareInput =
  'h-full min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400'

type InputProps = InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; invalid?: boolean }

export const AuthInput = forwardRef<HTMLInputElement, InputProps>(function AuthInput(
  { icon, invalid, className = '', ...props },
  ref,
) {
  return (
    <div className={`${fieldShell} ${invalid ? 'border-rose-400' : 'border-slate-300'} ${className}`}>
      {icon}
      <input ref={ref} aria-invalid={invalid || undefined} className={bareInput} {...props} />
    </div>
  )
})

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'icon'> & { toggle?: boolean }>(
  function PasswordInput({ invalid, toggle = true, className = '', ...props }, ref) {
    const { t } = useLocale()
    const [visible, setVisible] = useState(false)
    return (
      <div className={`${fieldShell} ${invalid ? 'border-rose-400' : 'border-slate-300'} ${className}`}>
        <LockIcon />
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          className={bareInput}
          {...props}
        />
        {toggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            className="text-sm font-semibold text-brand-500 hover:text-brand-700"
          >
            {visible ? t('auth.hide') : t('auth.show')}
          </button>
        )}
      </div>
    )
  },
)

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }>(
  function Checkbox({ label, className = '', ...props }, ref) {
    return (
      <label className={`flex cursor-pointer items-center gap-2.5 text-[15px] text-slate-700 ${className}`}>
        <input ref={ref} type="checkbox" className="size-[18px] shrink-0 cursor-pointer rounded accent-brand-500" {...props} />
        {label}
      </label>
    )
  },
)

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
      {message}
    </p>
  )
}

export function SuccessNote({ title, text }: { title: string; text?: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-lg border border-green-300 bg-green-100 px-4 py-3">
      <CheckIcon className="mt-0.5 size-[18px] shrink-0 text-green-700" />
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {text && <p className="mt-0.5 text-[13px] text-slate-700">{text}</p>}
      </div>
    </div>
  )
}

/** Development-only helper: the API returns tokens when no email provider is configured. */
export function DevLink({ to, text, label }: { to: string; text: string; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
      <p>{text}</p>
      <Link to={to} className="mt-1 inline-block font-semibold underline">
        {label}
      </Link>
    </div>
  )
}

/* Icons (stroke icons drawn to match the design's 18px line icons). */

type IconProps = { className?: string }

export function MailIcon({ className = 'size-[18px] shrink-0 text-slate-500' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  )
}

export function LockIcon({ className = 'size-[18px] shrink-0 text-slate-500' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function CheckIcon({ className = 'size-[18px] shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
