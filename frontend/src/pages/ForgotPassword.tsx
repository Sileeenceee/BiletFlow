import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router'
import { z } from 'zod'
import { forgotPassword } from '../api/auth'
import { AuthCard, AuthField, AuthHeading, AuthInput, DevLink, FormError, MailIcon, SuccessNote, primaryButtonClass } from '../components/auth'
import { useLocale } from '../lib/i18n'

export default function ForgotPassword() {
  const { t } = useLocale()
  const [sent, setSent] = useState(false)
  const [devToken, setDevToken] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const schema = useMemo(
    () => z.object({ email: z.string().min(1, t('auth.required')).email(t('auth.invalidEmail')) }),
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
      // The API answers the same way for every address, so it cannot be used to probe accounts.
      const res = await forgotPassword(values.email)
      setDevToken(res.resetToken)
      setSent(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('auth.genericError'))
    }
  }

  return (
    <AuthCard className="mx-auto max-w-[520px]">
      <AuthHeading title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-10 space-y-8">
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

        <div className="space-y-5">
          <FormError message={formError} />
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? t('auth.sending') : t('auth.sendLink')}
          </button>
          <p className="text-center">
            <Link to="/login" className="text-sm font-semibold text-cyan-700 hover:underline">
              {t('auth.backToLogin')}
            </Link>
          </p>
        </div>
      </form>

      {sent && (
        <div className="mt-6 space-y-3">
          <SuccessNote title={t('auth.linkSent')} text={t('auth.checkInbox')} />
          {devToken && (
            <DevLink
              to={`/reset-password?token=${encodeURIComponent(devToken)}`}
              text={t('auth.devLink')}
              label={t('auth.resetTitle')}
            />
          )}
        </div>
      )}
    </AuthCard>
  )
}
