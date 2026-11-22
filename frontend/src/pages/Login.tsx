import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { login, logout } from '../api/auth'
import heroImage from '../assets/auth-hero.jpg'
import {
  AuthField,
  AuthHeading,
  AuthInput,
  CheckIcon,
  Checkbox,
  FormError,
  LanguageSwitch,
  Logo,
  MailIcon,
  PasswordInput,
  linkClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/auth'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'

export default function Login() {
  const { t } = useLocale()
  const [formError, setFormError] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t('auth.required')).email(t('auth.invalidEmail')),
        password: z.string().min(1, t('auth.required')),
        keepLoggedIn: z.boolean(),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { keepLoggedIn: true } })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      const session = await login(values.email, values.password)
      if (!values.keepLoggedIn && session.refreshToken) {
        // Without the refresh token the session ends when the access token expires.
        void logout(session.refreshToken).catch(() => undefined)
        session.refreshToken = undefined
      }
      signIn(session)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/events', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('auth.genericError'))
    }
  }

  const features = [t('auth.feature1'), t('auth.feature2'), t('auth.feature3'), t('auth.feature4')]

  return (
    <div className="flex min-h-screen bg-white">
      <aside
        className="relative hidden w-[44%] max-w-[640px] shrink-0 flex-col bg-cover bg-center px-16 py-16 text-white lg:flex"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <Logo light />
        <div className="mt-auto mb-auto pt-16">
          <h2 className="font-display text-[44px] font-bold leading-[1.15] tracking-tight xl:text-[46px]">
            {t('auth.heroTitle1')}
            <br />
            <span className="text-accent">{t('auth.heroTitle2')}</span>
          </h2>
          <p className="mt-10 max-w-[420px] text-lg leading-relaxed text-white/90">{t('auth.heroText')}</p>
          <ul className="mt-20 space-y-4 text-[17px]">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-4">
                <CheckIcon className="size-5 shrink-0 text-accent" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-10 lg:py-10">
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <Logo className="lg:hidden" />
          <LanguageSwitch />
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-12">
          <AuthHeading title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')} />

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-12 space-y-5">
            <AuthField id="email" label={t('auth.email')} error={errors.email?.message}>
              <AuthInput
                id="email"
                type="email"
                autoComplete="email"
                placeholder="mail@nu.edu.kz"
                icon={<MailIcon />}
                invalid={!!errors.email}
                {...register('email')}
              />
            </AuthField>

            <AuthField id="password" label={t('auth.password')} error={errors.password?.message}>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                invalid={!!errors.password}
                {...register('password')}
              />
            </AuthField>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Checkbox label={t('auth.keepLoggedIn')} {...register('keepLoggedIn')} />
              <Link to="/forgot-password" className={`text-sm ${linkClass}`}>
                {t('auth.forgot')}
              </Link>
            </div>

            <FormError message={formError} />

            <button type="submit" disabled={isSubmitting} className={`${primaryButtonClass} mt-2`}>
              {isSubmitting ? t('auth.loggingIn') : t('auth.loginButton')}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-sm text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <Link to="/register" className={secondaryButtonClass}>
            {t('auth.createAccount')}
          </Link>

          <p className="mt-10 text-[13px] text-slate-500">{t('auth.eventAdminHint')}</p>
        </div>
      </section>
    </div>
  )
}
