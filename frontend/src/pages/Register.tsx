import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { login, registerAccount } from '../api/auth'
import { useAuth } from '../lib/auth'
import { useLocale, type MessageKey } from '../lib/i18n'
import { Field, buttonClass, inputClass } from '../components/form'

// Password rule matches AuthService.IsValidPassword (>= 8 characters).
// Messages are translation keys; they are translated where the error is shown.
const schema = z
  .object({
    email: z.string().min(1, 'form.required').email('form.invalidEmail'),
    password: z.string().min(8, 'form.minPassword'),
    confirmPassword: z.string().min(1, 'form.required'),
    createOrganizerProfile: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'form.passwordMismatch',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export default function Register() {
  const [formError, setFormError] = useState('')
  const [devToken, setDevToken] = useState<string | null>(null)
  const { signIn } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { createOrganizerProfile: false },
  })

  async function onSubmit(values: FormValues) {
    setFormError('')
    setDevToken(null)

    try {
      // The register endpoint does not issue a token, so sign in afterwards
      // with the same credentials.
      const created = await registerAccount({
        email: values.email,
        password: values.password,
        createOrganizerProfile: values.createOrganizerProfile,
      })

      const session = await login(values.email, values.password)
      signIn(session)

      if (created.verificationToken) {
        // Development only: no email provider is wired up yet, so surface the
        // token instead of sending it.
        setDevToken(created.verificationToken)
        return
      }

      navigate('/events', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('form.genericError'))
    }
  }

  if (devToken) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold">{t('register.created')}</h1>
        <p className="text-sm text-gray-600">{t('register.devToken')}</p>
        <code className="block break-all border rounded p-3 text-xs">{devToken}</code>
        <Link
          to={`/verify-email?token=${encodeURIComponent(devToken)}`}
          className={buttonClass + ' inline-block'}
        >
          {t('register.verifyNow')}
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{t('nav.register')}</h1>

      <Field id="email" label={t('form.email')} error={errors.email && t(errors.email.message as MessageKey)}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className={inputClass}
        />
      </Field>

      <Field id="password" label={t('form.password')} error={errors.password && t(errors.password.message as MessageKey)}>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          className={inputClass}
        />
      </Field>

      <Field
        id="confirmPassword"
        label={t('form.confirmPassword')}
        error={errors.confirmPassword && t(errors.confirmPassword.message as MessageKey)}
      >
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('createOrganizerProfile')} />
        {t('register.organizer')}
      </label>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={`${buttonClass} w-full`}>
        {isSubmitting ? t('register.submitting') : t('nav.register')}
      </button>

      <p className="text-sm">
        {t('register.haveAccount')}{' '}
        <Link to="/login" className="underline">
          {t('nav.signIn')}
        </Link>
      </p>
    </form>
  )
}
