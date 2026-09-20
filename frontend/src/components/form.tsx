import type { ReactNode } from 'react'

export const inputClass = 'w-full border rounded px-3 py-2'
export const buttonClass =
  'bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50'

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-red-600 mt-1">
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
      <label htmlFor={id} className="block text-sm mb-1">
        {label}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  )
}
