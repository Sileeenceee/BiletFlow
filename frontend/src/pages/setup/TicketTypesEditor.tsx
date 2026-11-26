import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { deleteTicketType, saveTicketType, type EventSummary, type TicketType } from '../../api/events'
import { Badge } from '../../components/EventCard'
import { inputClass } from '../../components/form'
import { AlertIcon, PlusIcon } from '../../components/icons'
import { useLocale } from '../../lib/i18n'
import { localDateTime } from './eventInput'

const label = 'block text-[13px] font-bold text-slate-900'

/** Ticket types as editable cards (design 4.3). Each card saves on its own; a new card is added with "Add ticket type". */
export function TicketTypesEditor({ event, types, onChange }: { event: EventSummary; types: TicketType[]; onChange: (types: TicketType[]) => void }) {
  const { t } = useLocale()
  const [drafts, setDrafts] = useState<number[]>(types.length === 0 ? [1] : [])
  const hasPaid = types.some((type) => type.price > 0)

  return (
    <section aria-label={t('setup.ticketTypes')}>
      <ul className="space-y-4">
        {types.map((type) => (
          <li key={type.id}>
            <TicketCard
              eventId={event.id}
              type={type}
              onSaved={(saved) => onChange(types.map((item) => item.id === saved.id ? saved : item))}
              onDeleted={() => onChange(types.filter((item) => item.id !== type.id))}
            />
          </li>
        ))}
        {drafts.map((key) => (
          <li key={`draft-${key}`}>
            <TicketCard
              eventId={event.id}
              onSaved={(saved) => { onChange([...types, saved]); setDrafts((current) => current.filter((item) => item !== key)) }}
              onDeleted={() => setDrafts((current) => current.filter((item) => item !== key))}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <button type="button" onClick={() => setDrafts((current) => [...current, Date.now()])} className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 text-[15px] font-bold text-slate-900 hover:bg-slate-50">
          <PlusIcon className="size-5" />{t('setup.addType')}
        </button>
        {hasPaid && event.paidSalesStatus !== 'Active' && (
          <div className="flex min-w-[280px] flex-1 items-start gap-3 rounded-xl border border-[#FBBF24]/60 bg-[#FEF3C7] px-5 py-3">
            <AlertIcon className="mt-0.5 size-5 shrink-0 text-[#B45309]" />
            <div className="flex-1"><p className="font-bold text-slate-900">{t('setup.paidLockedTitle')}</p><p className="text-sm text-slate-700">{t('setup.paidLockedText')}</p></div>
            <Link to={`/events/${event.id}/manage`} className="text-sm font-bold text-[#B45309] hover:underline">{t('setup.activate')}</Link>
          </div>
        )}
      </div>
    </section>
  )
}

function TicketCard({ eventId, type, onSaved, onDeleted }: { eventId: string; type?: TicketType; onSaved: (type: TicketType) => void; onDeleted: () => void }) {
  const { t } = useLocale()
  const [name, setName] = useState(type?.name ?? '')
  const [price, setPrice] = useState(String(type?.price ?? 0))
  const [hidden, setHidden] = useState(type?.isHidden ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const paid = Number(price) > 0

  async function save(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget)
    setError('')
    setSaved(false)
    setBusy(true)
    try {
      onSaved(await saveTicketType(eventId, {
        name: name.trim(),
        description: String(data.get('description')).trim() || null,
        price: Number(price),
        quantity: Number(data.get('quantity')),
        salesStartAt: data.get('salesStartAt') ? new Date(String(data.get('salesStartAt'))).toISOString() : null,
        salesEndAt: data.get('salesEndAt') ? new Date(String(data.get('salesEndAt'))).toISOString() : null,
        maxPerOrder: Number(data.get('maxPerOrder')),
        isHidden: hidden,
      }, type?.id))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manageEvent.typeSaveError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!type) { onDeleted(); return }
    setError('')
    setBusy(true)
    try {
      await deleteTicketType(eventId, type.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('manageEvent.typeDeleteError'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(form) => void save(form)} onChange={() => setSaved(false)} className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-xl font-bold text-slate-900">{name.trim() || t('setup.newType')}</h3>
        <Badge tone={paid ? 'cyan' : 'green'}>{paid ? t('setup.paid') : t('event.free')}</Badge>
        {type && <span className="text-xs text-slate-500">{t('setup.soldOf', { sold: type.soldQuantity, quantity: type.quantity })}</span>}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <label className={label}>{t('manageEvent.typeName')}<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className={label}>{t('setup.priceKzt')}<input required type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className={label}>{t('manageEvent.quantity')}<input required type="number" min={1} name="quantity" defaultValue={type?.quantity ?? ''} className={`${inputClass} mt-2`} /></label>
        <label className={label}>{t('manageEvent.maxPerOrder')}<input required type="number" min={1} max={100} name="maxPerOrder" defaultValue={type?.maxPerOrder ?? 6} className={`${inputClass} mt-2`} /></label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
        <label className={label}>{t('manageEvent.salesStart')}<input type="datetime-local" name="salesStartAt" defaultValue={localDateTime(type?.salesStartAt)} className={`${inputClass} mt-2`} /></label>
        <label className={label}>{t('manageEvent.salesEnd')}<input type="datetime-local" name="salesEndAt" defaultValue={localDateTime(type?.salesEndAt)} className={`${inputClass} mt-2`} /></label>
        <label className={label}>{t('createEvent.description')}<input maxLength={1000} name="description" defaultValue={type?.description ?? ''} className={`${inputClass} mt-2`} /></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700">
          <span>{t('manageEvent.hide')}</span>
          <button type="button" role="switch" aria-checked={hidden} onClick={() => { setHidden((value) => !value); setSaved(false) }} className={`relative h-6 w-11 rounded-full transition ${hidden ? 'bg-brand-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${hidden ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
        <div className="flex items-center gap-3">
          {saved && <span role="status" className="text-sm font-bold text-[#15803D]">{t('setup.saved')}</span>}
          {error && <span role="alert" className="text-sm text-rose-700">{error}</span>}
          <button type="button" disabled={busy} onClick={() => void remove()} className="h-10 rounded-lg px-4 text-sm font-bold text-[#B91C1C] hover:bg-rose-50 disabled:opacity-50">{type ? t('common.delete') : t('common.cancel')}</button>
          <button disabled={busy || !name.trim()} className="h-10 rounded-lg bg-brand-500 px-5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? t('common.saving') : type ? t('setup.saveChanges') : t('setup.saveType')}</button>
        </div>
      </div>
    </form>
  )
}
