import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { EventSummary } from '../../api/events'
import { activatePaidSalesWithTerms, getPaidSalesChecklist, payActivationFee, verifyOrganizerSimulation, type PaidSalesChecklist } from '../../api/platform'
import { buttonClass } from '../../components/form'
import { formatDateTime, formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

/** Paid-sales activation checklist (SRS 3.2, 4.5). Every step is a clearly labelled simulation. */
export function PaidSalesPanel({ event, onStatus, onError, onMessage }: {
  event: EventSummary
  onStatus: (status: NonNullable<EventSummary['paidSalesStatus']>) => void
  onError: (value: string) => void
  onMessage: (value: string) => void
}) {
  const [checklist, setChecklist] = useState<PaidSalesChecklist | null>(null)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const { t } = useLocale()

  useEffect(() => {
    let active = true
    getPaidSalesChecklist(event.id)
      .then((value) => { if (active) setChecklist(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('paidSales.loadError')) })
    return () => { active = false }
  }, [event.id, onError, t])

  async function run(action: () => Promise<PaidSalesChecklist>, done: string) {
    onError('')
    onMessage('')
    setBusy(true)
    try {
      const next = await action()
      setChecklist(next)
      onStatus(next.paidSalesStatus)
      onMessage(done)
    } catch (err) {
      onError(err instanceof Error ? err.message : t('paidSales.stepError'))
    } finally {
      setBusy(false)
    }
  }

  const stepButton = 'w-full rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50'
  const active = checklist?.paidSalesStatus === 'Active'
  // The profile link sits inside the sentence, so the translation marks its place with {link}.
  const [payoutHintBefore, payoutHintAfter = ''] = t('paidSales.payoutHint').split('{link}')
  const verified = Boolean(checklist?.items.find((item) => item.key === 'identityVerification')?.completed)
  return (
    <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="text-lg font-bold">{t('paidSales.title')}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{t('paidSales.text')}</p></div>
      <p className="rounded-xl bg-slate-50 p-3 text-sm">{t('paidSales.statusLabel')}: <strong>{t(`paidSales.status.${checklist?.paidSalesStatus ?? event.paidSalesStatus ?? 'None'}`)}</strong>{checklist?.activatedAt && <span className="block text-xs text-slate-500">{t('paidSales.activatedAt', { time: formatDateTime(checklist.activatedAt) })}</span>}</p>
      {checklist?.paidSalesStatus === 'Suspended' && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t('paidSales.suspended')}</p>}
      {checklist && (
        <ol className="space-y-2">
          {checklist.items.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-sm">
              <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${item.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{item.completed ? '✓' : '·'}</span>
              <span className={item.completed ? 'text-slate-700' : 'text-slate-500'}>{item.label}<span className="sr-only">{` — ${item.completed ? t('paidSales.done') : t('paidSales.todo')}`}</span></span>
            </li>
          ))}
        </ol>
      )}
      {checklist && !active && checklist.paidSalesStatus !== 'Suspended' && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <button disabled={busy || verified} onClick={() => void run(async () => { await verifyOrganizerSimulation(); return getPaidSalesChecklist(event.id) }, t('paidSales.verifiedMessage'))} className={stepButton}>{verified ? t('paidSales.verified') : t('paidSales.verify')}</button>
          <p className="text-xs text-slate-500">{payoutHintBefore}<Link to="/organizer/profile" className="font-semibold text-indigo-700 underline">{t('paidSales.profileLink')}</Link>{payoutHintAfter}</p>
          <button disabled={busy || Boolean(checklist.feePaidAt)} onClick={() => void run(() => payActivationFee(event.id), t('paidSales.feeMessage'))} className={stepButton}>{checklist.feePaidAt ? t('paidSales.feePaid') : t('paidSales.payFee', { amount: formatKzt(checklist.activationFeeKzt) })}</button>
          <label className="flex items-start gap-2 pt-1 text-sm"><input type="checkbox" checked={terms} onChange={(change) => setTerms(change.target.checked)} className="mt-1 size-4 accent-indigo-600" />{t('paidSales.terms')}</label>
          <button disabled={busy || !terms || !checklist.canActivate} onClick={() => void run(async () => (await activatePaidSalesWithTerms(event.id)).checklist, t('paidSales.activatedMessage'))} className={`${buttonClass} w-full`}>{t('paidSales.activate')}</button>
          {!checklist.canActivate && <p className="text-xs text-slate-500">{t('paidSales.remaining')}</p>}
        </div>
      )}
    </aside>
  )
}
