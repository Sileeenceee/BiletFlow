import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { login } from '../api/auth'
import { useAuth } from '../lib/auth'
import { Field, buttonClass, inputClass } from '../components/form'

const schema = z.object({
  email: z.string().min(1, 'Required').email('Enter a valid email'),
  password: z.string().min(1, 'Required'),
})

type FormValues = z.infer<typeof schema>

export default function Login() {
  const [formError, setFormError] = useState('')
  const { signIn } = useAuth()
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
      navigate(from ?? '/events', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Sign in</h1>

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
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="flex justify-between text-sm">
        <Link to="/register" className="underline">
          Create an account
        </Link>
        <Link to="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </div>
    </form>
  )
}
