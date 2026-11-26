import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getSupportCases, type SupportCase } from '../../api/workflows'
import { Badge } from '../../components/EventCard'
import { ChevronRightIcon } from '../../components/icons'
import { formatDateTime } from '../../lib/format'
import { useLocale, type MessageKey } from '../../lib/i18n'
import { card, Empty } from './ui'

const tone = (status: string) => status === 'Resolved' ? 'green' : status === 'In Progress' ? 'amber' : status === 'Waiting for Customer' ? 'slate' : 'cyan'

const statusKeys: Record<string, MessageKey> = { Open: 'support.status.open', 'In Progress': 'support.status.inProgress', 'Waiting for Customer': 'support.status.waiting', Resolved: 'support.status.resolved' }

/** Support cases about this event; replies happen in the support inbox. */
export function SupportTab({ eventId, onError }: { eventId: string; onError: (value: string) => void }) {
  const { t } = useLocale()
  const [cases, setCases] = useState<SupportCase[] | null>(null)

  useEffect(() => {
    let active = true
    getSupportCases()
      .then((rows) => { if (active) setCases(rows.filter((row) => row.eventId === eventId)) })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('support.loadError')) })
    return () => { active = false }
  }, [eventId, onError, t])

  if (!cases) return <p className="text-slate-500">{t('support.loading')}</p>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-display text-[26px] font-bold text-slate-900">{t('manage.supportTitle')}</h2><p className="mt-1 text-[15px] text-slate-600">{t('manage.supportText')}</p></div>
        <Link to="/support" className="text-sm font-bold text-brand-500 hover:text-brand-700">{t('manage.openInbox')}</Link>
      </div>
      {cases.length === 0 ? <Empty>{t('manage.noCases')}</Empty> : (
        <ul className="space-y-3">
          {cases.map((item) => (
            <li key={item.id}>
              <Link to={`/support?caseId=${item.id}`} className={`${card} flex items-center gap-4 px-6 py-4 transition hover:border-slate-300`}>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900">{item.subject}</span>
                  <span className="block text-sm text-slate-600">{item.category} · {formatDateTime(item.updatedAt)}</span>
                  <span className="mt-1 block truncate text-sm text-slate-500">{item.messages.at(-1)?.body}</span>
                </span>
                <Badge tone={tone(item.status)}>{statusKeys[item.status] ? t(statusKeys[item.status]) : item.status}</Badge>
                <ChevronRightIcon className="size-5 text-slate-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
