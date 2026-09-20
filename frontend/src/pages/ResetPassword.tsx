import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { resetPassword } from '../api/auth'
import { Field, buttonClass, inputClass } from '../components/form'

const schema = z
  .object({
    token: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export default function ResetPassword() {
  const [params] = useSearchParams()
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token: params.get('token') ?? '' },
  })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await resetPassword(values.token, values.newPassword)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1500)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (done) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p role="status">Redirecting you to sign in…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Set a new password</h1>

      <Field id="token" label="Reset token" error={errors.token?.message}>
        <input id="token" {...register('token')} className={inputClass} />
      </Field>

      <Field id="newPassword" label="New password" error={errors.newPassword?.message}>
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
        label="Confirm new password"
        error={errors.confirmPassword?.message}
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
        {isSubmitting ? 'Saving…' : 'Set password'}
      </button>

      <p className="text-sm">
        <Link to="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}
