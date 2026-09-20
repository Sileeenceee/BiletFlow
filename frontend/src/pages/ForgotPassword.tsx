import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router'
import { z } from 'zod'
import { forgotPassword } from '../api/auth'
import { Field, buttonClass, inputClass } from '../components/form'

const schema = z.object({
  email: z.string().min(1, 'Required').email('Enter a valid email'),
})

type FormValues = z.infer<typeof schema>

export default function ForgotPassword() {
  const [message, setMessage] = useState('')
  const [devToken, setDevToken] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

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
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Reset your password</h1>

      <Field id="email" label="Email" error={errors.email?.message}>
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
        {isSubmitting ? 'Sending…' : 'Send reset instructions'}
      </button>

      {message && (
        <p role="status" className="text-sm text-gray-700">
          {message}
        </p>
      )}

      {devToken && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Development only — the reset token is shown here because no email
            provider is configured.
          </p>
          <code className="block break-all border rounded p-3 text-xs">{devToken}</code>
          <Link
            to={`/reset-password?token=${encodeURIComponent(devToken)}`}
            className="underline text-sm"
          >
            Continue to reset
          </Link>
        </div>
      )}

      <p className="text-sm">
        <Link to="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}
