import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { EventSummary } from '../../api/events'
import { activatePaidSalesWithTerms, getPaidSalesChecklist, payActivationFee, verifyOrganizerSimulation, type PaidSalesChecklist } from '../../api/platform'
import { buttonClass } from '../../components/form'
import { formatDateTime, formatKzt } from '../../lib/format'

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

  useEffect(() => {
    let active = true
    getPaidSalesChecklist(event.id)
      .then((value) => { if (active) setChecklist(value) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : 'Could not load the activation checklist.') })
    return () => { active = false }
  }, [event.id, onError])

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
      onError(err instanceof Error ? err.message : 'The activation step failed.')
    } finally {
      setBusy(false)
    }
  }

  const stepButton = 'w-full rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50'
  const active = checklist?.paidSalesStatus === 'Active'
  const verified = Boolean(checklist?.items.find((item) => item.key === 'identityVerification')?.completed)
  return (
    <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="text-lg font-bold">Paid ticket sales</h2><p className="mt-1 text-sm leading-6 text-slate-500">Activation is a classroom simulation. It does not verify identity, charge a real fee, or configure real payouts.</p></div>
      <p className="rounded-xl bg-slate-50 p-3 text-sm">Status: <strong>{checklist?.paidSalesStatus ?? event.paidSalesStatus ?? 'None'}</strong>{checklist?.activatedAt && <span className="block text-xs text-slate-500">Activated {formatDateTime(checklist.activatedAt)}</span>}</p>
      {checklist?.paidSalesStatus === 'Suspended' && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Paid sales were suspended by a platform administrator. Open a support request to resolve it.</p>}
      {checklist && (
        <ol className="space-y-2">
          {checklist.items.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-sm">
              <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${item.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{item.completed ? '✓' : '·'}</span>
              <span className={item.completed ? 'text-slate-700' : 'text-slate-500'}>{item.label}<span className="sr-only">{item.completed ? ' — done' : ' — to do'}</span></span>
            </li>
          ))}
        </ol>
      )}
      {checklist && !active && checklist.paidSalesStatus !== 'Suspended' && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <button disabled={busy || verified} onClick={() => void run(async () => { await verifyOrganizerSimulation(); return getPaidSalesChecklist(event.id) }, 'Organizer verification simulated.')} className={stepButton}>{verified ? 'Identity and payout verified (simulation)' : 'Simulate identity and payout verification'}</button>
          <p className="text-xs text-slate-500">Needs a payout reference in your <Link to="/organizer/profile" className="font-semibold text-indigo-700 underline">organizer profile</Link>.</p>
          <button disabled={busy || Boolean(checklist.feePaidAt)} onClick={() => void run(() => payActivationFee(event.id), 'Activation fee payment simulated.')} className={stepButton}>{checklist.feePaidAt ? 'Activation fee paid (simulation)' : `Simulate paying the ${formatKzt(checklist.activationFeeKzt)} activation fee`}</button>
          <label className="flex items-start gap-2 pt-1 text-sm"><input type="checkbox" checked={terms} onChange={(change) => setTerms(change.target.checked)} className="mt-1 size-4 accent-indigo-600" />I accept the paid-event terms for this event.</label>
          <button disabled={busy || !terms || !checklist.canActivate} onClick={() => void run(async () => (await activatePaidSalesWithTerms(event.id)).checklist, 'Paid sales activated for this event (simulation).')} className={`${buttonClass} w-full`}>Activate paid sales</button>
          {!checklist.canActivate && <p className="text-xs text-slate-500">Complete the remaining checklist steps to activate.</p>}
        </div>
      )}
    </aside>
  )
}
