import type { ReactNode } from 'react'

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-slate-50'
export const buttonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50'

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
      <label htmlFor={id} className="mb-2 block text-[13px] font-bold text-slate-900">
        {label}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  )
}
