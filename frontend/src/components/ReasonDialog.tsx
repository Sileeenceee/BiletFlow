import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocale } from '../lib/i18n'
import { buttonClass, inputClass } from './form'

type Pending = { title: string; resolve: (value: string | null) => void }

/**
 * In-page replacement for window.prompt: `ask(title)` resolves with the typed
 * text, or null when the dialog is cancelled. Render `dialog` once in the page.
 */
export function useReasonDialog(): { dialog: ReactNode; ask: (title: string) => Promise<string | null> } {
  const { t } = useLocale()
  const [pending, setPending] = useState<Pending | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)

  function ask(title: string) {
    return new Promise<string | null>((resolve) => setPending({ title, resolve }))
  }

  function close(value: string | null) {
    pending?.resolve(value)
    setPending(null)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    close(input.current?.value.trim() ?? '')
  }

  const dialog = pending && (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/40 p-4" onKeyDown={(event) => { if (event.key === 'Escape') close(null) }}>
      <form role="dialog" aria-modal="true" aria-label={pending.title} onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold">{pending.title}</h2>
        <label className="block text-sm font-medium">{t('reasonDialog.note')}
          <textarea ref={input} autoFocus rows={3} maxLength={500} className={`${inputClass} mt-1.5`} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => close(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('common.cancel')}</button>
          <button className={buttonClass}>{t('common.confirm')}</button>
        </div>
      </form>
    </div>
  )
  return { dialog, ask }
}
