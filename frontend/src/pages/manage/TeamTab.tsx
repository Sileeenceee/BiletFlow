import { useEffect, useState, type FormEvent } from 'react'
import { assignEventStaff, getEventStaff, removeEventStaff, type StaffAssignment } from '../../api/workflows'
import { Badge } from '../../components/EventCard'
import { inputClass } from '../../components/form'
import { ScanIcon } from '../../components/icons'
import { formatDateTime } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import { card, Empty, table, tableWrap, td, th, thead } from './ui'

/** Event admins who check people in (design 4.11), for this event. */
export function TeamTab({ eventId, onError, onMessage }: { eventId: string; onError: (value: string) => void; onMessage: (value: string) => void }) {
  const { t } = useLocale()
  const [staff, setStaff] = useState<StaffAssignment[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getEventStaff(eventId).then((rows) => { if (active) setStaff(rows) }).catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.staffLoadError')) })
    return () => { active = false }
  }, [eventId, onError, t])

  async function assign(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    onError('')
    setBusy(true)
    try {
      await assignEventStaff(eventId, email.trim())
      setEmail('')
      setStaff(await getEventStaff(eventId))
      onMessage(t('manageEvent.staffAssigned'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.assignError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string) {
    onError('')
    try {
      await removeEventStaff(eventId, userId)
      setStaff((current) => current?.filter((row) => row.userId !== userId) ?? null)
      onMessage(t('manageEvent.staffRemoved'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.removeError'))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-[26px] font-bold text-slate-900">{t('manage.tab.team')}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{t('manage.teamText')}</p>
      </div>
      {!staff ? <p className="text-slate-500">{t('manageEvent.loading')}</p> : staff.length === 0 ? <Empty>{t('manageEvent.noStaff')}</Empty> : (
        <div className={tableWrap}>
          <table className={`${table} min-w-[560px]`}>
            <thead className={thead}><tr><th className={th}>{t('checkout.email')}</th><th className={th}>{t('orders.statusLabel')}</th><th className={th}>{t('manage.assignedOn')}</th><th className={th}><span className="sr-only">{t('common.remove')}</span></th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {staff.map((row) => (
                <tr key={row.userId}>
                  <td className={`${td} font-bold text-slate-900`}>{row.email}</td>
                  <td className={td}><Badge tone="green">{t('manageEvent.active')}</Badge></td>
                  <td className={td}>{formatDateTime(row.assignedAt)}</td>
                  <td className={`${td} text-right`}><button type="button" onClick={() => void remove(row.userId)} className="text-[15px] font-bold text-[#B91C1C] hover:underline">{t('common.remove')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={(form) => void assign(form)} className={`${card} p-6`}>
        <h3 className="font-display text-xl font-bold text-slate-900">{t('manageEvent.assignTitle')}</h3>
        <p className="mt-1 text-sm text-slate-600">{t('manageEvent.assignText')}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[260px] flex-1 text-[13px] font-bold text-slate-900">{t('manageEvent.accountEmail')}<input required type="email" value={email} onChange={(change) => setEmail(change.target.value)} placeholder="name@example.kz" className={`${inputClass} mt-2`} /></label>
          <button disabled={busy} className="h-11 rounded-lg bg-brand-500 px-8 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('manageEvent.assigning') : t('manageEvent.assign')}</button>
        </div>
      </form>
      <div className="flex items-center gap-4 rounded-2xl border border-[#C9D4EE] bg-[#EEF3FE] p-6">
        <ScanIcon className="size-8 shrink-0 text-brand-500" />
        <div><p className="font-display text-lg font-bold text-slate-900">{t('manage.checkinApp')}</p><p className="text-sm text-slate-600">{t('manage.checkinAppText')}</p></div>
      </div>
    </div>
  )
}
