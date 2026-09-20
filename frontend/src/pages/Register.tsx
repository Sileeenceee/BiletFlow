import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { login, registerAccount } from '../api/auth'
import { useAuth } from '../lib/auth'
import { Field, buttonClass, inputClass } from '../components/form'

// Password rule matches AuthService.IsValidPassword (>= 8 characters).
const schema = z
  .object({
    email: z.string().min(1, 'Required').email('Enter a valid email'),
    password: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Required'),
    createOrganizerProfile: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export default function Register() {
  const [formError, setFormError] = useState('')
  const [devToken, setDevToken] = useState<string | null>(null)
  const { signIn } = useAuth()
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
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (devToken) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Account created</h1>
        <p className="text-sm text-gray-600">
          Email delivery is not configured yet, so the verification token is shown
          here for the demo.
        </p>
        <code className="block break-all border rounded p-3 text-xs">{devToken}</code>
        <Link
          to={`/verify-email?token=${encodeURIComponent(devToken)}`}
          className={buttonClass + ' inline-block'}
        >
          Verify email now
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Create account</h1>

      <Field id="email" label="Email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className={inputClass}
        />
      </Field>

      <Field id="password" label="Password" error={errors.password?.message}>
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
        label="Confirm password"
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

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('createOrganizerProfile')} />
        I want to create and manage events (Organizer)
      </label>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={`${buttonClass} w-full`}>
        {isSubmitting ? 'Creating…' : 'Create account'}
      </button>

      <p className="text-sm">
        Already have an account?{' '}
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
