import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocale } from '../lib/i18n'
import { inputClass } from './form'
import { AlertIcon } from './icons'
import { Modal } from './Modal'

type Pending = { title: string; warning?: string; resolve: (value: string | null) => void }

/**
 * In-page replacement for window.prompt: `ask(title)` resolves with the typed
 * text, or null when the dialog is cancelled. Render `dialog` once in the page.
 */
export function useReasonDialog(): { dialog: ReactNode; ask: (title: string, warning?: string) => Promise<string | null> } {
  const { t } = useLocale()
  const [pending, setPending] = useState<Pending | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)

  function ask(title: string, warning?: string) {
    return new Promise<string | null>((resolve) => setPending({ title, warning, resolve }))
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
    <Modal title={pending.title} onClose={() => close(null)}>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <label className="block text-[13px] font-bold text-slate-900">{t('reasonDialog.note')}
          <textarea ref={input} rows={3} maxLength={500} className={`${inputClass} mt-2`} />
        </label>
        {pending.warning && (
          <div className="flex gap-3 rounded-xl border border-[#FBBF24]/60 bg-[#FEF3C7] px-4 py-3 text-sm text-slate-800"><AlertIcon className="size-5 shrink-0 text-[#B45309]" />{pending.warning}</div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => close(null)} className="h-11 rounded-lg border border-slate-300 bg-white px-6 text-sm font-bold text-slate-900 hover:bg-slate-50">{t('common.cancel')}</button>
          <button className="h-11 rounded-lg bg-[#B91C1C] px-6 text-sm font-bold text-white hover:bg-rose-800">{t('common.confirm')}</button>
        </div>
      </form>
    </Modal>
  )
  return { dialog, ask }
}
