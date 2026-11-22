import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { resetPassword } from '../api/auth'
import { AuthCard, AuthField, AuthHeading, FormError, PasswordInput, SuccessNote, primaryButtonClass, secondaryButtonClass } from '../components/auth'
import { useLocale } from '../lib/i18n'

export default function ResetPassword() {
  const { t } = useLocale()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  // Password rule matches AuthService.IsValidPassword (>= 8 characters).
  const schema = useMemo(
    () =>
      z
        .object({
          newPassword: z.string().min(8, t('auth.min8')),
          confirmPassword: z.string().min(1, t('auth.required')),
        })
        .refine((d) => d.newPassword === d.confirmPassword, {
          message: t('auth.mismatch'),
          path: ['confirmPassword'],
        }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await resetPassword(token, values.newPassword)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1500)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('auth.genericError'))
    }
  }

  return (
    <AuthCard className="mx-auto max-w-[520px]">
      <AuthHeading title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')} />

      {!token ? (
        <div className="mt-8 space-y-5">
          <FormError message={t('auth.resetNoToken')} />
          <Link to="/forgot-password" className={secondaryButtonClass}>
            {t('auth.requestNew')}
          </Link>
        </div>
      ) : done ? (
        <div className="mt-8">
          <SuccessNote title={t('auth.resetDone')} />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-10 space-y-8">
          <AuthField id="newPassword" label={t('auth.newPassword')} error={errors.newPassword?.message}>
            <PasswordInput id="newPassword" autoComplete="new-password" invalid={!!errors.newPassword} {...register('newPassword')} />
          </AuthField>

          <AuthField id="confirmPassword" label={t('auth.confirmPassword')} error={errors.confirmPassword?.message}>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              toggle={false}
              invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
          </AuthField>

          <FormError message={formError} />

          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? t('auth.saving') : t('auth.saveButton')}
          </button>
        </form>
      )}
    </AuthCard>
  )
}
