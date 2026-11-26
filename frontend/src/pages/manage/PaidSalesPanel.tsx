import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { EventSummary } from '../../api/events'
import { activatePaidSalesWithTerms, getPaidSalesChecklist, payActivationFee, verifyOrganizerSimulation, type PaidSalesChecklist } from '../../api/platform'
import { Badge } from '../../components/EventCard'
import { CheckIcon } from '../../components/icons'
import { formatDateTime, formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import { card, sectionTitle } from './ui'

/** Paid-sales activation checklist (SRS 3.2, 4.5; design 4.6). Every step is a clearly labelled simulation. */
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

  if (!checklist) return <p className="text-slate-500">{t('paidSales.loading')}</p>
  const active = checklist.paidSalesStatus === 'Active'
  const suspended = checklist.paidSalesStatus === 'Suspended'
  const done = checklist.items.filter((item) => item.completed).length
  const firstOpen = checklist.items.findIndex((item) => !item.completed)
  const verified = Boolean(checklist.items.find((item) => item.key === 'identityVerification')?.completed)
  // The profile link sits inside the sentence, so the translation marks its place with {link}.
  const [payoutHintBefore, payoutHintAfter = ''] = t('paidSales.payoutHint').split('{link}')
  const stepButton = 'inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-6 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50'

  // Actions the API offers for each checklist step; the other steps are completed elsewhere.
  const actionFor = (key: string): ReactNode => {
    if (active || suspended) return null
    switch (key) {
      case 'identityVerification':
        return <button type="button" disabled={busy || verified} onClick={() => void run(async () => { await verifyOrganizerSimulation(); return getPaidSalesChecklist(event.id) }, t('paidSales.verifiedMessage'))} className={stepButton}>{t('paidSales.verify')}</button>
      case 'activationFee':
        return (
          <div className="mt-4 border-t border-[#C9D4EE] pt-4">
            <p className="text-[13px] font-bold text-slate-600">{t('paidSales.feeLabel')}</p>
            <p className="font-display text-[23px] font-bold text-slate-900">{formatKzt(checklist.activationFeeKzt)}</p>
            <button type="button" disabled={busy || Boolean(checklist.feePaidAt)} onClick={() => void run(() => payActivationFee(event.id), t('paidSales.feeMessage'))} className="mt-3 inline-flex h-11 items-center rounded-lg bg-accent px-6 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-50">{t('paidSales.payFee', { amount: formatKzt(checklist.activationFeeKzt) })}</button>
          </div>
        )
      case 'payoutAccount':
        return <p className="mt-2 text-sm text-slate-600">{payoutHintBefore}<Link to="/organizer/profile" className="font-bold text-brand-500 underline">{t('paidSales.profileLink')}</Link>{payoutHintAfter}</p>
      case 'paidTicketType':
        return <Link to={`/events/${event.id}/manage?tab=tickets`} className={stepButton}>{t('setup.addType')}</Link>
      default:
        return null
    }
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <h2 className={sectionTitle}>{active ? t('paidSales.activeTitle') : t('paidSales.activateTitle')}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{active && checklist.activatedAt ? t('paidSales.activatedAt', { time: formatDateTime(checklist.activatedAt) }) : t('paidSales.progress', { done, total: checklist.items.length })}</p>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#E2E8F0]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(done / Math.max(checklist.items.length, 1)) * 100}%` }} /></div>
        {suspended && <p role="alert" className="mt-4 rounded-xl bg-[#FEE2E2] p-4 text-sm text-[#B91C1C]">{t('paidSales.suspended')}</p>}

        <ol className="mt-5 space-y-4">
          {checklist.items.map((item, index) => {
            const current = index === firstOpen && !active && !suspended
            const isTerms = item.key === 'terms'
            return (
              <li key={item.key} className={`rounded-2xl p-6 ${current ? 'border-2 border-brand-500 bg-[#EEF3FE]' : `${card}`}`}>
                <div className="flex items-start gap-4">
                  {item.completed
                    ? <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#15803D] text-white"><CheckIcon className="size-5" /></span>
                    : <span className={`grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold ${current ? 'border-brand-500 text-brand-500' : 'border-slate-300 text-slate-500'}`}>{index + 1}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="font-display text-lg font-bold text-slate-900">{item.label}</p>
                      {item.completed && <Badge tone="green">{t('paidSales.done')}</Badge>}
                    </div>
                    {!item.completed && !isTerms && <div className="mt-3">{actionFor(item.key)}</div>}
                    {!item.completed && isTerms && !active && !suspended && (
                      <label className="mt-3 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={terms} onChange={(change) => setTerms(change.target.checked)} className="mt-0.5 size-4 accent-brand-500" />{t('paidSales.terms')}</label>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        {!active && !suspended && (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" disabled={busy || !terms || !checklist.canActivate} onClick={() => void run(async () => (await activatePaidSalesWithTerms(event.id)).checklist, t('paidSales.activatedMessage'))} className="h-12 rounded-lg bg-brand-500 px-8 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{t('paidSales.activate')}</button>
            {!checklist.canActivate && <p className="text-sm text-slate-500">{t('paidSales.remaining')}</p>}
            {checklist.canActivate && !terms && <p className="text-sm text-slate-500">{t('paidSales.acceptFirst')}</p>}
          </div>
        )}
      </div>

      <aside className={`${card} p-6`}>
        <h3 className="font-display text-xl font-bold text-slate-900">{t('paidSales.whatYouGet')}</h3>
        <ul className="mt-4 space-y-3">
          {(['paidSales.get.checkout', 'paidSales.get.payouts', 'paidSales.get.reports', 'paidSales.get.promos'] as const).map((key) => (
            <li key={key} className="flex items-center gap-3 text-[15px] text-slate-800"><CheckIcon className="size-5 text-[#15803D]" />{t(key)}</li>
          ))}
        </ul>
        <p className="mt-5 text-[13px] leading-5 text-slate-500">{t('paidSales.freeNote')}</p>
        {checklist.isSimulation && <p className="mt-3 rounded-lg bg-[#FEF3C7] p-3 text-[13px] text-[#92400E]">{t('paidSales.text')}</p>}
      </aside>
    </div>
  )
}
