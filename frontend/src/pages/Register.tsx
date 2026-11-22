import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { login, registerAccount } from '../api/auth'
import {
  AuthCard,
  AuthField,
  AuthHeading,
  AuthInput,
  Checkbox,
  FormError,
  MailIcon,
  PasswordInput,
  primaryButtonClass,
} from '../components/auth'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'

export default function Register() {
  const { t } = useLocale()
  const [formError, setFormError] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Password rule matches AuthService.IsValidPassword (>= 8 characters).
  const schema = useMemo(
    () =>
      z.object({
        intent: z.enum(['attend', 'organize']),
        firstName: z.string().trim().min(1, t('auth.required')),
        lastName: z.string().trim().min(1, t('auth.required')),
        email: z.string().min(1, t('auth.required')).email(t('auth.invalidEmail')),
        password: z.string().min(8, t('auth.min8')),
        agree: z.boolean().refine((value) => value, t('auth.mustAgree')),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      intent: params.get('intent') === 'organize' ? 'organize' : 'attend',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      agree: false,
    },
  })
  const intent = useWatch({ control, name: 'intent' })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      const created = await registerAccount({
        fullName: `${values.firstName.trim()} ${values.lastName.trim()}`,
        email: values.email,
        password: values.password,
        createOrganizerProfile: values.intent === 'organize',
      })

      // The register endpoint does not issue a token, so sign in afterwards.
      const session = await login(values.email, values.password)
      signIn(session)

      navigate(`/verify-email?email=${encodeURIComponent(values.email)}`, {
        replace: true,
        // Development only: no email provider is wired up, so the token travels with the page.
        state: { devToken: created.verificationToken },
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('auth.genericError'))
    }
  }

  const roles = [
    { value: 'attend', title: t('auth.findEvents'), hint: t('auth.findEventsHint') },
    { value: 'organize', title: t('auth.organize'), hint: t('auth.organizeHint') },
  ] as const

  return (
    <div className="mx-auto max-w-[600px]">
      <AuthCard>
        <AuthHeading center title={t('auth.signupTitle')} subtitle={t('auth.signupSubtitle')} />

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-10 space-y-5">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-slate-900">{t('auth.iWantTo')}</legend>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-5">
              {roles.map((role) => {
                const selected = intent === role.value
                return (
                  <label
                    key={role.value}
                    className={`flex cursor-pointer gap-3 rounded-lg p-4 transition ${
                      selected
                        ? 'border-2 border-brand-500 bg-[#effeff] p-[15px]'
                        : 'border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      value={role.value}
                      className="mt-1 size-[18px] shrink-0 cursor-pointer accent-brand-500"
                      {...register('intent')}
                    />
                    <span>
                      <span className="block text-[15px] font-semibold text-slate-900">{role.title}</span>
                      <span className="mt-0.5 block text-[13px] text-slate-600">{role.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <AuthField id="firstName" label={t('auth.firstName')} error={errors.firstName?.message}>
              <AuthInput id="firstName" autoComplete="given-name" placeholder="Firstname" invalid={!!errors.firstName} {...register('firstName')} />
            </AuthField>
            <AuthField id="lastName" label={t('auth.lastName')} error={errors.lastName?.message}>
              <AuthInput id="lastName" autoComplete="family-name" placeholder="Lastname" invalid={!!errors.lastName} {...register('lastName')} />
            </AuthField>
          </div>

          <AuthField id="email" label={t('auth.email')} error={errors.email?.message} hint={t('auth.emailHint')}>
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
            <PasswordInput id="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
          </AuthField>

          <div className="pt-3">
            <Checkbox label={t('auth.agree')} {...register('agree')} />
            {errors.agree && (
              <p role="alert" className="mt-1.5 text-sm text-rose-600">
                {errors.agree.message}
              </p>
            )}
          </div>

          <FormError message={formError} />

          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? t('auth.creating') : t('auth.signupButton')}
          </button>

          <p className="text-center text-sm text-slate-600">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="hover:text-slate-900 hover:underline">
              {t('auth.logInLink')}
            </Link>
          </p>
        </form>
      </AuthCard>
    </div>
  )
}
