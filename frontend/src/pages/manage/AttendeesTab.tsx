import { useEffect, useState } from 'react'
import { getAttendees, getTicketTypes, type Attendee, type TicketType } from '../../api/events'
import { Badge } from '../../components/EventCard'
import { DownloadIcon, SearchIcon } from '../../components/icons'
import { orderCode, saveBlob } from '../../lib/format'
import { isMessageKey, useLocale } from '../../lib/i18n'
import { Empty, secondaryButton, table, tableWrap, td, th, thead } from './ui'

const tone = (status: string) => status === 'Valid' ? 'green' : status === 'CheckedIn' ? 'cyan' : status === 'Refunded' ? 'amber' : 'slate'

/** Attendee list with search and filters (design 4.7). Search runs on the server; the filters narrow what came back. */
export function AttendeesTab({ eventId, onError, onOpenOrder }: { eventId: string; onError: (value: string) => void; onOpenOrder: (orderId: string) => void }) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<Attendee[]>([])
  const [types, setTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const statusLabel = (value: string) => { const key = `orders.ticketStatus.${value}`; return isMessageKey(key) ? t(key) : value }

  useEffect(() => { getTicketTypes(eventId).then(setTypes).catch(() => undefined) }, [eventId])
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      getAttendees(eventId, search).then((value) => { if (active) setRows(value) })
        .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.attendeesLoadError')) })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [eventId, onError, search, t])

  const shown = rows.filter((row) => (!type || row.ticketTypeName === type) && (!status || row.status === status))
  const statuses = [...new Set(rows.map((row) => row.status))]

  function exportCsv() {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`
    const lines = [[t('role.Attendee'), t('checkout.email'), t('setup.ticketType'), t('orders.order'), t('orders.statusLabel')].map(quote).join(',')]
    for (const row of shown) lines.push([row.attendeeName, row.attendeeEmail, row.ticketTypeName, orderCode({ id: row.orderId }), statusLabel(row.status)].map(quote).join(','))
    saveBlob(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), `attendees-${eventId.slice(0, 8)}.csv`)
  }

  const select = 'h-11 rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900'
  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 sm:flex-none">
          <SearchIcon className="size-5 text-slate-500" />
          <input aria-label={t('manageEvent.searchAttendees')} value={search} onChange={(event) => { setLoading(true); setSearch(event.target.value) }} placeholder={t('manage.searchAttendees')} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-500" />
        </label>
        <select aria-label={t('analytics.ticketType')} value={type} onChange={(event) => setType(event.target.value)} className={select}>
          <option value="">{t('analytics.allTypes')}</option>
          {types.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
        <select aria-label={t('orders.statusLabel')} value={status} onChange={(event) => setStatus(event.target.value)} className={select}>
          <option value="">{t('manage.allStatuses')}</option>
          {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
        </select>
        <button type="button" disabled={shown.length === 0} onClick={exportCsv} className={`${secondaryButton} sm:ml-auto`}><DownloadIcon className="size-5" />{t('manage.exportList')}</button>
      </div>
      <p className="mt-5 text-[15px] font-bold text-slate-800">{t('manage.attendeeCount', { count: shown.length })}</p>
      {loading ? <p className="mt-4 text-sm text-slate-500">{t('manageEvent.searching')}</p> : shown.length === 0 ? <div className="mt-4"><Empty>{t('manageEvent.noAttendees')}</Empty></div> : (
        <div className={`${tableWrap} mt-3`}>
          <table className={`${table} min-w-[680px]`}>
            <thead className={thead}><tr><th className={th}>{t('role.Attendee')}</th><th className={th}>{t('setup.ticketType')}</th><th className={th}>{t('orders.order')}</th><th className={th}>{t('orders.statusLabel')}</th><th className={th}><span className="sr-only">{t('orders.details')}</span></th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {shown.map((row) => (
                <tr key={row.ticketId}>
                  <td className={td}><span className="block font-bold text-slate-900">{row.attendeeName}</span><span className="block text-[13px] text-slate-500">{row.attendeeEmail}</span></td>
                  <td className={td}>{row.ticketTypeName}</td>
                  <td className={`${td} font-mono text-sm`}>{orderCode({ id: row.orderId })}</td>
                  <td className={td}><Badge tone={tone(row.status)}>{statusLabel(row.status)}</Badge></td>
                  <td className={`${td} text-right`}><button type="button" onClick={() => onOpenOrder(row.orderId)} className="text-[15px] font-bold text-brand-500 hover:text-brand-700">{t('manage.open')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
