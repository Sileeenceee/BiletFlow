import { useEffect, useState } from 'react'
import { cancelEvent, getEventOrders, type EventSummary } from '../../api/events'
import { inputClass } from '../../components/form'
import { CheckIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { useLocale } from '../../lib/i18n'
import { dangerButton, secondaryButton } from './ui'

/**
 * Cancelling settles every order in one step on the server: paid orders are refunded (simulated),
 * free registrations cancelled and ticket holders notified (design 4.14). Typing the title confirms it.
 */
export function CancelEventModal({ event, onClose, onCancelled }: { event: EventSummary; onClose: () => void; onCancelled: (event: EventSummary) => void }) {
  const { t } = useLocale()
  const [counts, setCounts] = useState<{ paid: number; attendees: number } | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getEventOrders(event.id)
      .then((orders) => {
        if (!active) return
        const confirmed = orders.filter((order) => order.status === 'Confirmed')
        setCounts({
          paid: confirmed.filter((order) => order.total > 0).length,
          attendees: confirmed.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.tickets.filter((ticket) => ticket.status === 'Valid').length, 0), 0),
        })
      })
      .catch(() => { if (active) setCounts(null) })
    return () => { active = false }
  }, [event.id])

  async function submit() {
    setError('')
    setBusy(true)
    try {
      onCancelled(await cancelEvent(event.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('events.cancelError'))
      setBusy(false)
    }
  }

  const effects = [
    counts ? t('cancelEvent.refunds', { count: counts.paid }) : t('cancelEvent.refundsGeneric'),
    counts ? t('cancelEvent.notify', { count: counts.attendees }) : t('cancelEvent.notifyGeneric'),
    t('cancelEvent.calendar'),
  ]
  return (
    <Modal title={t('cancelEvent.title')} onClose={onClose} width="max-w-[560px]">
      <p className="mt-3 text-[15px] text-slate-600">{t('cancelEvent.text')}</p>
      <ul className="mt-5 space-y-3">
        {effects.map((text) => (
          <li key={text} className="flex items-center gap-3 text-[15px] text-slate-800">
            <span className="grid size-5 place-items-center rounded bg-brand-500 text-white"><CheckIcon className="size-3.5" /></span>{text}
          </li>
        ))}
      </ul>
      <label className="mt-6 block text-[13px] font-bold text-slate-900">{t('cancelEvent.typeName')}
        <input value={confirm} onChange={(change) => setConfirm(change.target.value)} placeholder={event.title} autoComplete="off" className={`${inputClass} mt-2`} />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr]">
        <button type="button" onClick={onClose} className={`${secondaryButton} h-12 px-10`}>{t('cancelEvent.keep')}</button>
        <button type="button" disabled={busy || confirm.trim() !== event.title.trim()} onClick={() => void submit()} className={`${dangerButton} h-12`}>{busy ? t('manageEvent.cancelling') : t('cancelEvent.confirm')}</button>
      </div>
    </Modal>
  )
}
