import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiBlob } from '../../api/client'
import { deleteCampaign, getCampaignAnalytics, getCampaigns, getTicketTypes, saveCampaign, type CampaignAnalytics, type PromoCampaign, type TicketType } from '../../api/events'
import { Badge } from '../../components/EventCard'
import { inputClass } from '../../components/form'
import { DownloadIcon, PlusIcon } from '../../components/icons'
import { formatKzt, formatNumber, saveBlob } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import { localDateTime } from '../setup/eventInput'
import { card, Empty, secondaryButton, table, tableWrap, td, th, thead } from './ui'

const usedUp = (campaign: PromoCampaign) => campaign.maxRedemptions !== null && campaign.redemptions >= campaign.maxRedemptions

/** Promo codes and campaign QR links (design 4.9). */
export function PromotionsTab({ eventId, onError, onMessage }: { eventId: string; onError: (value: string) => void; onMessage: (value: string) => void }) {
  const { t } = useLocale()
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([])
  const [analytics, setAnalytics] = useState<CampaignAnalytics[]>([])
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState<'closed' | 'new' | PromoCampaign>('closed')

  const refresh = useCallback(async () => {
    const [campaignRows, analyticsRows, ticketRows] = await Promise.all([getCampaigns(eventId), getCampaignAnalytics(eventId), getTicketTypes(eventId)])
    setCampaigns(campaignRows)
    setAnalytics(analyticsRows)
    setTickets(ticketRows)
    return campaignRows
  }, [eventId])

  useEffect(() => {
    let active = true
    Promise.all([getCampaigns(eventId), getCampaignAnalytics(eventId), getTicketTypes(eventId)])
      .then(([campaignRows, analyticsRows, ticketRows]) => {
        if (!active) return
        setCampaigns(campaignRows)
        setAnalytics(analyticsRows)
        setTickets(ticketRows)
        if (campaignRows[0]) setSelectedId((current) => current || campaignRows[0].id)
      })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.campaignsLoadError')) })
    return () => { active = false }
  }, [eventId, onError, t])

  const selected = campaigns.find((campaign) => campaign.id === selectedId) ?? null
  const discount = (campaign: PromoCampaign) => campaign.discountType === 'Percentage' ? `${campaign.discountValue}%` : formatKzt(campaign.discountValue)

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[26px] font-bold text-slate-900">{t('manage.campaigns')}</h2>
          <button type="button" onClick={() => setForm('new')} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-6 text-sm font-bold text-white hover:bg-brand-600"><PlusIcon className="size-5" />{t('manage.newCampaign')}</button>
        </div>
        {campaigns.length === 0 ? <Empty>{t('manageEvent.noCampaigns')}</Empty> : (
          <div className={tableWrap}>
            <table className={`${table} min-w-[560px]`}>
              <thead className={thead}><tr><th className={th}>{t('analytics.code')}</th><th className={th}>{t('analytics.discount')}</th><th className={th}>{t('manage.used')}</th><th className={th}>{t('orders.statusLabel')}</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} aria-selected={campaign.id === selectedId} onClick={() => setSelectedId(campaign.id)} className={`cursor-pointer transition ${campaign.id === selectedId ? 'bg-[#EEF3FE]' : 'hover:bg-slate-50'}`}>
                    <td className={`${td} font-bold text-slate-900`}><button type="button" onClick={() => setSelectedId(campaign.id)} className="text-left">{campaign.code}</button></td>
                    <td className={td}>{discount(campaign)}</td>
                    <td className={td}>{campaign.redemptions}{campaign.maxRedemptions !== null ? ` / ${campaign.maxRedemptions}` : ''}</td>
                    <td className={td}>{!campaign.isEnabled ? <Badge tone="slate">{t('manageEvent.disabled')}</Badge> : usedUp(campaign) ? <Badge tone="amber">{t('manage.usedUp')}</Badge> : <Badge tone="green">{t('manageEvent.active')}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {form !== 'closed' && (
          <CampaignForm
            key={form === 'new' ? 'new' : form.id}
            eventId={eventId}
            editing={form === 'new' ? null : form}
            tickets={tickets}
            onCancel={() => setForm('closed')}
            onSaved={async (message) => { setForm('closed'); await refresh(); onMessage(message) }}
            onError={onError}
          />
        )}
      </div>
      {selected && (
        <CampaignPanel
          key={selected.id}
          eventId={eventId}
          campaign={selected}
          stats={analytics.find((row) => row.campaignId === selected.id)}
          onEdit={() => setForm(selected)}
          onDisable={async () => {
            onError('')
            try {
              await deleteCampaign(eventId, selected.id)
              await refresh()
              onMessage(t('manageEvent.campaignRemoved'))
            } catch (err) {
              onError(err instanceof Error ? err.message : t('manageEvent.campaignRemoveError'))
            }
          }}
          onError={onError}
        />
      )}
    </div>
  )
}

function CampaignForm({ eventId, editing, tickets, onCancel, onSaved, onError }: {
  eventId: string
  editing: PromoCampaign | null
  tickets: TicketType[]
  onCancel: () => void
  onSaved: (message: string) => Promise<void>
  onError: (value: string) => void
}) {
  const { t } = useLocale()
  const [kind, setKind] = useState<'Percentage' | 'FixedKzt'>(editing?.discountType ?? 'Percentage')
  const [busy, setBusy] = useState(false)
  const label = 'block text-[13px] font-bold text-slate-900'

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    onError('')
    setBusy(true)
    try {
      await saveCampaign(eventId, {
        code: String(data.get('code')).trim().toUpperCase(),
        discountType: kind,
        discountValue: Number(data.get('discountValue')),
        startsAt: data.get('startsAt') ? new Date(String(data.get('startsAt'))).toISOString() : null,
        endsAt: data.get('endsAt') ? new Date(String(data.get('endsAt'))).toISOString() : null,
        maxRedemptions: data.get('maxRedemptions') ? Number(data.get('maxRedemptions')) : null,
        ticketTypeIds: data.getAll('ticketTypeIds').map(String),
      }, editing?.id)
      await onSaved(editing ? t('manageEvent.campaignUpdated') : t('manageEvent.campaignCreated'))
    } catch (err) {
      onError(err instanceof Error ? err.message : t('manageEvent.campaignSaveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(form) => void submit(form)} className={`${card} p-6`}>
      <h3 className="font-display text-[22px] font-bold text-slate-900">{editing ? t('manageEvent.editCampaign') : t('manage.newCampaign')}</h3>
      <label className={`${label} mt-5`}>{t('event.promo')}<input required maxLength={40} name="code" defaultValue={editing?.code ?? ''} placeholder="ASTANA20" className={`${inputClass} mt-2 uppercase`} /></label>
      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr_1fr]">
        <fieldset>
          <legend className={label}>{t('manageEvent.discountType')}</legend>
          <div className="mt-2 inline-flex rounded-lg bg-[#F1F5F9] p-1">
            {(['Percentage', 'FixedKzt'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={`h-9 rounded-md px-4 text-sm transition ${kind === value ? 'bg-white font-bold text-slate-900 shadow-sm' : 'text-slate-600'}`}>{value === 'Percentage' ? t('manage.byPercent') : t('manage.fixed')}</button>
            ))}
          </div>
        </fieldset>
        <label className={label}>{t('manageEvent.value')}<input required type="number" min="0.01" step="0.01" max={kind === 'Percentage' ? 100 : undefined} name="discountValue" defaultValue={editing?.discountValue ?? ''} className={`${inputClass} mt-2`} /></label>
        <label className={label}>{t('manageEvent.maxRedemptions')}<input type="number" min="1" name="maxRedemptions" defaultValue={editing?.maxRedemptions ?? ''} className={`${inputClass} mt-2`} /></label>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={label}>{t('manage.validFrom')}<input type="datetime-local" name="startsAt" defaultValue={localDateTime(editing?.startsAt)} className={`${inputClass} mt-2`} /></label>
        <label className={label}>{t('manage.validUntil')}<input type="datetime-local" name="endsAt" defaultValue={localDateTime(editing?.endsAt)} className={`${inputClass} mt-2`} /></label>
      </div>
      {tickets.length > 0 && (
        <fieldset className="mt-5">
          <legend className={label}>{t('manageEvent.appliesTo')}</legend>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">{tickets.map((ticket) => <label key={ticket.id} className="flex items-center gap-2 text-[15px] text-slate-800"><input type="checkbox" name="ticketTypeIds" value={ticket.id} defaultChecked={editing?.ticketTypeIds.includes(ticket.id)} className="size-[18px] accent-brand-500" />{ticket.name}</label>)}</div>
          <p className="mt-2 text-xs text-slate-500">{t('manageEvent.appliesHint')}</p>
        </fieldset>
      )}
      <div className="mt-6 flex gap-3">
        <button disabled={busy} className="h-12 rounded-lg bg-brand-500 px-8 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('common.saving') : editing ? t('manageEvent.saveCampaign') : t('manageEvent.createCampaign')}</button>
        <button type="button" onClick={onCancel} className={`${secondaryButton} h-12 px-8`}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}

function CampaignPanel({ eventId, campaign, stats, onEdit, onDisable, onError }: {
  eventId: string
  campaign: PromoCampaign
  stats: CampaignAnalytics | undefined
  onEdit: () => void
  onDisable: () => Promise<void>
  onError: (value: string) => void
}) {
  const { t } = useLocale()
  const [qr, setQr] = useState<{ url: string; blob: Blob } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let url = ''
    let active = true
    apiBlob(`/api/events/${eventId}/campaigns/${campaign.id}/qr`)
      .then((blob) => { if (active) { url = URL.createObjectURL(blob); setQr({ url, blob }) } })
      .catch((err: unknown) => { if (active) onError(err instanceof Error ? err.message : t('manageEvent.qrError')) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [campaign.id, eventId, onError, t])

  return (
    <aside className={`${card} p-6 xl:sticky xl:top-24`} aria-label={campaign.code}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[22px] font-bold text-slate-900">{campaign.code}</h3>
        {campaign.isEnabled ? <Badge tone="green">{t('manageEvent.active')}</Badge> : <Badge tone="slate">{t('manageEvent.disabled')}</Badge>}
      </div>
      <div className="mt-4 flex items-start gap-4">
        {qr ? <img src={qr.url} alt={t('manage.qrAlt', { code: campaign.code })} className="size-40 shrink-0" /> : <div className="size-40 shrink-0 rounded-xl bg-slate-100" />}
        <div>
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-slate-900">{t('manage.promoQr')}</span>
          <p className="mt-2 font-bold text-slate-900">{t('manage.notEntry')}</p>
          <p className="mt-1 text-[13px] text-slate-600">{t('manage.notEntryText')}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#F1F5F9] px-3 py-2.5">
        <p className="min-w-0 flex-1 break-all text-[13px] text-slate-800">{campaign.campaignUrl}</p>
        <button type="button" onClick={() => void navigator.clipboard.writeText(campaign.campaignUrl).then(() => setCopied(true))} className="shrink-0 text-xs font-bold text-brand-500">{copied ? t('manage.copied') : t('manageEvent.copyLink')}</button>
      </div>
      <p className="mt-2 text-[13px] text-slate-600">{t('manage.qrNote', { code: campaign.code })}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={!qr} onClick={() => qr && saveBlob(qr.blob, `campaign-${campaign.code}.png`)} className={secondaryButton}><DownloadIcon className="size-5" />{t('manage.downloadPng')}</button>
        <button type="button" onClick={onEdit} className={secondaryButton}>{t('common.edit')}</button>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-200 pt-5">
        <Metric label={t('analytics.redemptions')} value={`${campaign.redemptions}${campaign.maxRedemptions !== null ? ` / ${campaign.maxRedemptions}` : ''}`} />
        <Metric label={t('analytics.linkVisits')} value={formatNumber(campaign.linkVisits)} />
        <Metric label={t('analytics.tickets')} value={formatNumber(stats?.ticketsSold ?? 0)} />
        <Metric label={t('analytics.gross')} value={formatKzt(stats?.grossRevenue ?? 0)} />
        <Metric label={t('analytics.discount')} value={formatKzt(-(stats?.discountTotal ?? 0))} />
        <Metric label={t('analytics.net')} value={formatKzt(stats?.netRevenue ?? 0)} accent />
      </dl>
      {campaign.isEnabled && <button type="button" onClick={() => void onDisable()} className="mt-5 text-sm font-bold text-[#B91C1C] hover:underline">{t('manageEvent.disable')}</button>}
    </aside>
  )
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><dt className="text-[13px] text-slate-500">{label}</dt><dd className={`mt-0.5 font-bold ${accent ? 'text-[#15803D]' : 'text-slate-900'}`}>{value}</dd></div>
}
