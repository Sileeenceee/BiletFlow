import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router'
import { z } from 'zod'
import { forgotPassword } from '../api/auth'
import { Field, buttonClass, inputClass } from '../components/form'
import { useLocale, type MessageKey } from '../lib/i18n'

// Messages are translation keys; they are translated where the error is shown.
const schema = z.object({
  email: z.string().min(1, 'form.required').email('form.invalidEmail'),
})

type FormValues = z.infer<typeof schema>

export default function ForgotPassword() {
  const [message, setMessage] = useState('')
  const [devToken, setDevToken] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const { t } = useLocale()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      const res = await forgotPassword(values.email)
      // The API always returns the same message so it cannot be used to probe
      // which emails exist.
      setMessage(res.message)
      setDevToken(res.resetToken)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('form.genericError'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('forgot.title')}</h1>

      <Field id="email" label={t('form.email')} error={errors.email && t(errors.email.message as MessageKey)}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className={inputClass}
        />
      </Field>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={buttonClass}>
        {isSubmitting ? t('forgot.submitting') : t('forgot.submit')}
      </button>

      {message && (
        <p role="status" className="text-sm text-gray-700">
          {message}
        </p>
      )}

      {devToken && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">{t('forgot.devToken')}</p>
          <code className="block break-all border rounded p-3 text-xs">{devToken}</code>
          <Link
            to={`/reset-password?token=${encodeURIComponent(devToken)}`}
            className="underline text-sm"
          >
            {t('forgot.continue')}
          </Link>
        </div>
      )}

      <p className="text-sm">
        <Link to="/login" className="underline">
          {t('form.backToSignIn')}
        </Link>
      </p>
    </form>
  )
}
