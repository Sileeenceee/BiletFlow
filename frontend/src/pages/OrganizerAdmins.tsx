import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getEvents, type EventSummary } from '../api/events'
import { assignEventStaff, getEventStaff, removeEventStaff } from '../api/workflows'
import { Badge } from '../components/EventCard'
import { inputClass } from '../components/form'
import { ScanIcon } from '../components/icons'
import { formatDateTime } from '../lib/format'
import { useLocale } from '../lib/i18n'
import { card, Empty, table, tableWrap, td, th, thead } from './manage/ui'

type StaffRow = { userId: string; email: string; events: { id: string; title: string; assignedAt: string }[] }

/** Event admins across all of the organizer's events (design 4.11). Assignments are still per event. */
export default function OrganizerAdmins() {
  const { t } = useLocale()
  const [events, setEvents] = useState<EventSummary[]>([])
  const [staff, setStaff] = useState<StaffRow[] | null>(null)
  const [email, setEmail] = useState('')
  const [eventId, setEventId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const own = (await getEvents(true)).filter((event) => !event.isCancelled)
    const assignments = await Promise.all(own.map((event) => getEventStaff(event.id).then((rows) => rows.map((row) => ({ ...row, event })))))
    const byUser = new Map<string, StaffRow>()
    for (const row of assignments.flat()) {
      const entry = byUser.get(row.userId) ?? { userId: row.userId, email: row.email, events: [] }
      entry.events.push({ id: row.event.id, title: row.event.title, assignedAt: row.assignedAt })
      byUser.set(row.userId, entry)
    }
    return { own, rows: [...byUser.values()].sort((a, b) => a.email.localeCompare(b.email)) }
  }, [])

  useEffect(() => {
    let active = true
    load()
      .then(({ own, rows }) => { if (!active) return; setEvents(own); setStaff(rows); setEventId((current) => current || own[0]?.id || '') })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : t('manageEvent.staffLoadError')) })
    return () => { active = false }
  }, [load, t])

  async function refresh() {
    const { rows } = await load()
    setStaff(rows)
  }

  async function assign(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await assignEventStaff(eventId, email.trim())
      setEmail('')
      await refresh()
      setMessage(t('manageEvent.staffAssigned'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manageEvent.assignError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string, fromEventId: string) {
    setError('')
    setMessage('')
    try {
      await removeEventStaff(fromEventId, userId)
      await refresh()
      setMessage(t('manageEvent.staffRemoved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manageEvent.removeError'))
    }
  }

  const last = (row: StaffRow) => row.events.reduce((latest, item) => item.assignedAt > latest ? item.assignedAt : latest, row.events[0]?.assignedAt ?? '')
  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div>
        <h1 className="font-display text-[34px] font-bold tracking-tight text-slate-900">{t('manage.tab.team')}</h1>
        <p className="mt-1 text-[15px] text-slate-600">{t('manage.teamText')}</p>
      </div>
      {message && <p role="status" className="rounded-xl bg-[#DCFCE7] p-3 text-sm font-bold text-[#166534]">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-[#FEE2E2] p-3 text-sm text-[#B91C1C]">{error}</p>}
      {!staff ? <p className="text-slate-500">{t('manageEvent.loading')}</p> : staff.length === 0 ? <Empty>{t('manageEvent.noStaff')}</Empty> : (
        <div className={tableWrap}>
          <table className={`${table} min-w-[720px]`}>
            <thead className={thead}><tr><th className={th}>{t('checkout.email')}</th><th className={th}>{t('admins.assignedEvents')}</th><th className={th}>{t('orders.statusLabel')}</th><th className={th}>{t('admins.lastAssigned')}</th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {staff.map((row) => (
                <tr key={row.userId} className="align-top">
                  <td className={`${td} font-bold text-slate-900`}>{row.email}</td>
                  <td className={td}>
                    <ul className="flex flex-wrap gap-2">
                      {row.events.map((item) => (
                        <li key={item.id} className="inline-flex items-center gap-2 rounded-full bg-[#F1F5F9] py-1 pl-3 pr-1.5 text-sm text-slate-800">
                          {item.title}
                          <button type="button" aria-label={t('admins.removeFrom', { email: row.email, title: item.title })} onClick={() => void remove(row.userId, item.id)} className="grid size-5 place-items-center rounded-full text-slate-500 hover:bg-rose-100 hover:text-[#B91C1C]">×</button>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={td}><Badge tone="green">{t('manageEvent.active')}</Badge></td>
                  <td className={`${td} text-slate-600`}>{last(row) ? formatDateTime(last(row)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={(form) => void assign(form)} className={`${card} p-6`}>
        <h2 className="font-display text-xl font-bold text-slate-900">{t('manageEvent.assignTitle')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('manageEvent.assignText')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-[13px] font-bold text-slate-900">{t('manageEvent.accountEmail')}<input required type="email" value={email} onChange={(change) => setEmail(change.target.value)} placeholder="name@example.kz" className={`${inputClass} mt-2`} /></label>
          <label className="text-[13px] font-bold text-slate-900">{t('dashboard.event')}<select required value={eventId} onChange={(change) => setEventId(change.target.value)} className={`${inputClass} mt-2`}>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
        </div>
        <button disabled={busy || !eventId} className="mt-5 h-12 rounded-lg bg-brand-500 px-8 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('manageEvent.assigning') : t('manageEvent.assign')}</button>
      </form>
      <div className="flex items-center gap-4 rounded-2xl border border-[#C9D4EE] bg-[#EEF3FE] p-6">
        <ScanIcon className="size-8 shrink-0 text-brand-500" />
        <div><p className="font-display text-lg font-bold text-slate-900">{t('manage.checkinApp')}</p><p className="text-sm text-slate-600">{t('manage.checkinAppText')}</p></div>
      </div>
    </div>
  )
}
