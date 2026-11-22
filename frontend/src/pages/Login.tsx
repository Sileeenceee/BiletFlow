import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { login } from '../api/auth'
import { useAuth } from '../lib/auth'
import { useLocale, type MessageKey } from '../lib/i18n'
import { Field, buttonClass, inputClass } from '../components/form'

// Messages are translation keys; they are translated where the error is shown.
const schema = z.object({
  email: z.string().min(1, 'form.required').email('form.invalidEmail'),
  password: z.string().min(1, 'form.required'),
})

type FormValues = z.infer<typeof schema>

export default function Login() {
  const [formError, setFormError] = useState('')
  const { signIn } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()
  const location = useLocation()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      const session = await login(values.email, values.password)
      signIn(session)
      const from = (location.state as { from?: string } | null)?.from
      const target = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/events'
      navigate(target, { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('form.genericError'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{t('nav.signIn')}</h1>

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
          autoComplete="current-password"
          {...register('password')}
          className={inputClass}
        />
      </Field>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={`${buttonClass} w-full`}>
        {isSubmitting ? t('login.submitting') : t('nav.signIn')}
      </button>

      <div className="flex justify-between text-sm">
        <Link to="/register" className="underline">
          {t('login.createAccount')}
        </Link>
        <Link to="/forgot-password" className="underline">
          {t('login.forgot')}
        </Link>
      </div>
    </form>
  )
}
