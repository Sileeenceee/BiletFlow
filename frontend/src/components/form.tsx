import type { ReactNode } from 'react'

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
export const buttonClass =
  'inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50'

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-sm text-rose-600">
      {message}
    </p>
  )
}

type FieldProps = {
  /** Must match the id given to the input inside. */
  id: string
  label: string
  error?: string
  children: ReactNode
}

/**
 * Wraps one form control with a properly associated <label> and its
 * error message. htmlFor/id is what makes the label clickable and
 * readable by assistive technology.
 */
export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  )
}
