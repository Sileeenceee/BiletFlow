import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { resetPassword } from '../api/auth'
import { Field, buttonClass, inputClass } from '../components/form'
import { useLocale, type MessageKey } from '../lib/i18n'

// Messages are translation keys; they are translated where the error is shown.
const schema = z
  .object({
    token: z.string().min(1, 'form.required'),
    newPassword: z.string().min(8, 'form.minPassword'),
    confirmPassword: z.string().min(1, 'form.required'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'form.passwordMismatch',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export default function ResetPassword() {
  const [params] = useSearchParams()
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)
  const { t } = useLocale()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token: params.get('token') ?? '' },
  })

  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => navigate('/login', { replace: true }), 1500)
    return () => window.clearTimeout(timer)
  }, [done, navigate])

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await resetPassword(values.token, values.newPassword)
      setDone(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('form.genericError'))
    }
  }

  if (done) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">{t('reset.done')}</h1>
        <p role="status">{t('reset.redirecting')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('reset.title')}</h1>

      <Field id="token" label={t('reset.token')} error={errors.token && t(errors.token.message as MessageKey)}>
        <input id="token" {...register('token')} className={inputClass} />
      </Field>

      <Field id="newPassword" label={t('reset.newPassword')} error={errors.newPassword && t(errors.newPassword.message as MessageKey)}>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
          className={inputClass}
        />
      </Field>

      <Field
        id="confirmPassword"
        label={t('reset.confirm')}
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

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={buttonClass}>
        {isSubmitting ? t('reset.submitting') : t('reset.submit')}
      </button>

      <p className="text-sm">
        <Link to="/login" className="underline">
          {t('form.backToSignIn')}
        </Link>
      </p>
    </form>
  )
}
