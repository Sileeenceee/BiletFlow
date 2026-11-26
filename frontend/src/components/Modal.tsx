import { useEffect, useId, useRef, type ReactNode } from 'react'

/** Centered dialog over a dimmed page (designs 4.8 and 4.14). Escape or the backdrop closes it. */
export function Modal({ title, onClose, children, width = 'max-w-[520px]' }: { title: string; onClose: () => void; children: ReactNode; width?: string }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <button type="button" aria-hidden="true" tabIndex={-1} onClick={onClose} className="fixed inset-0 cursor-default bg-slate-900/50" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative w-full ${width} rounded-2xl bg-white p-8 shadow-2xl`}>
        <h2 id={titleId} className="font-display text-[26px] font-bold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  )
}
