import { SeatMap } from '../../components/SeatMap'
import { formatEventDate, formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import { MAX_SEATS_PER_ORDER, type Flow } from './flow'
import { card, Notice } from './shared'

export function SeatStep({ flow }: { flow: Flow }) {
  const { event, seatMap, seats } = flow
  const { t } = useLocale()
  return (
    <div>
      <button type="button" onClick={() => flow.goTo('select')} className="text-sm font-bold text-brand-500 hover:text-brand-700">← {t('checkout.backToEvent')}</button>
      <h1 className="mt-3 font-display text-[38px] font-bold leading-tight tracking-tight text-slate-900">{t('seats.title')}</h1>
      <p className="mt-1 text-[15px] text-slate-600">{[event.title, formatEventDate(event.startDateUtc, event.timezone), event.venue].filter(Boolean).join(', ')}</p>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className={`${card} min-w-0 p-6`}>
          {seatMap ? <SeatMap map={seatMap} selected={seats.map((seat) => seat.seatId)} limit={MAX_SEATS_PER_ORDER} onToggle={flow.toggleSeat} />
            : <p role="alert" className="text-sm text-rose-700">{flow.seatMapError || t('event.loading')}</p>}
        </div>

        <aside className={`${card} p-6 lg:sticky lg:top-24`} aria-label={t('seats.yours')}>
          <h2 className="font-display text-[23px] font-bold text-slate-900">{t('seats.yours')}</h2>
          {seats.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t('seats.none')}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {seats.map((seat) => (
                <li key={seat.seatId} className="flex items-start justify-between gap-3 rounded-xl bg-[#F1F5F9] px-4 py-3">
                  <div>
                    <p className="font-bold text-slate-900">{t('seatMap.seat', { section: flow.seatSectionName(seat), row: seat.rowLabel, seat: seat.number })}</p>
                    <p className="text-[13px] text-slate-600">{flow.seatPrice(seat) ? formatKzt(flow.seatPrice(seat)) : t('event.free')}</p>
                  </div>
                  <button type="button" aria-label={t('seats.removeSeat', { seat: `${seat.rowLabel}${seat.number}` })} onClick={() => flow.toggleSeat(seat)} className="text-lg leading-none text-slate-500 hover:text-slate-900">×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex items-baseline justify-between border-t border-slate-200 pt-5">
            <span className="font-display text-xl font-bold text-slate-900">{t('event.total')}</span>
            <span className="font-display text-[26px] font-bold text-slate-900">{formatKzt(flow.subtotal)}</span>
          </div>
          {seatMap && <p className="mt-2 text-[13px] text-slate-500">{t('seats.holdNote', { minutes: seatMap.holdMinutes })}</p>}
          {flow.hasPaidTickets && !flow.paidSalesReady && <div className="mt-4"><Notice tone="amber">{t('event.notActivated')}</Notice></div>}
          <button type="button" disabled={!flow.hasSelection || (flow.hasPaidTickets && !flow.paidSalesReady)} onClick={() => flow.goTo('details')} className="mt-5 h-14 w-full rounded-lg bg-accent text-[17px] font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">
            {t('seats.continue')}
          </button>
          <button type="button" disabled={seats.length === 0} onClick={flow.clearSeats} className="mt-3 h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50">
            {t('seats.clear')}
          </button>
          <p className="mt-5 text-[13px] leading-5 text-slate-600">{t('seats.accessibleNote')}</p>
          {flow.error && <p role="alert" className="mt-3 text-sm text-rose-700">{flow.error}</p>}
        </aside>
      </div>
    </div>
  )
}
