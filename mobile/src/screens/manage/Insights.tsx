import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getTicketTypes, type TicketType } from '../../api/events'
import { getActivityTypes, getEventAnalytics, getEventHistory, type EventAnalytics, type HistoryEntry } from '../../api/platform'
import { DateField } from '../../components/DateField'
import { Badge, Card, Empty, Header, Loading, Row, Select, Stat, colors, text } from '../../components/ui'
import { dayBoundary, errorMessage, formatDate, formatDateTime, formatKzt, formatNumber, humanize } from '../../lib/format'
import { isMessageKey, useLocale } from '../../lib/i18n'
import type { TabProps } from './types'

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  )
}

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const { t } = useLocale()
  return (
    <View style={styles.dates}>
      <View style={styles.flex}><DateField mode="date" label={t('analytics.from')} value={from} onChange={onFrom} optional /></View>
      <View style={styles.flex}><DateField mode="date" label={t('analytics.to')} value={to} onChange={onTo} optional /></View>
    </View>
  )
}

/** Basic organizer analytics from BiletFlow records (SRS 4.15). */
export function Analytics({ event, onError }: TabProps) {
  const { t } = useLocale()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ticketTypeId, setTicketTypeId] = useState('')
  const [types, setTypes] = useState<TicketType[]>([])
  const [data, setData] = useState<EventAnalytics | null>(null)

  useEffect(() => { getTicketTypes(event.id).then(setTypes).catch(() => undefined) }, [event.id])

  useEffect(() => {
    let active = true
    getEventAnalytics(event.id, { from: dayBoundary(from), to: dayBoundary(to, true), ticketTypeId: ticketTypeId || undefined })
      .then((value) => { if (active) setData(value) })
      .catch((err: unknown) => { if (active) onError(errorMessage(err, t('analytics.loadError'))) })
    return () => { active = false }
  }, [event.id, from, onError, t, ticketTypeId, to])

  if (!data) return <Loading label={t('analytics.loading')} />
  const { capacity, revenue, attendance } = data
  const peak = Math.max(...data.salesOverTime.map((point) => point.ticketsSold), 1)
  const topType = Math.max(...data.ticketTypes.map((row) => row.sold), 1)

  return (
    <View style={styles.gap}>
      <Card style={styles.gap}>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Select label={t('analytics.ticketType')} value={ticketTypeId} onChange={setTicketTypeId} options={[{ value: '', label: t('analytics.allTypes') }, ...types.map((type) => ({ value: type.id, label: type.name }))]} />
        <Text style={text.muted}>{t('analytics.source')} {revenue.isDemonstration ? t('analytics.demo') : ''}</Text>
      </Card>

      <View style={styles.stats}>
        <Stat label={t('analytics.capacity')} value={formatNumber(capacity.totalCapacity)} hint={t('analytics.capacityHint', { remaining: formatNumber(capacity.ticketsRemaining), reserved: formatNumber(capacity.ticketsReserved) })} />
        <Stat label={t('analytics.ticketsSold')} value={formatNumber(capacity.ticketsSold)} hint={t('analytics.soldHint', { percent: capacity.percentSold })} />
        <Stat label={t('analytics.netDemo')} value={formatKzt(revenue.netRevenue)} hint={t('analytics.grossHint', { amount: formatKzt(revenue.grossSales) })} />
        <Stat label={t('analytics.checkedIn')} value={`${attendance.checkInPercentage}%`} hint={t('analytics.checkedInHint', { checkedIn: attendance.checkedIn, registered: attendance.registered, absent: attendance.absent })} />
      </View>

      <Card>
        <Text style={text.heading}>{t('analytics.revenueTitle')}</Text>
        <Row label={t('analytics.grossSales')} value={formatKzt(revenue.grossSales)} />
        <Row label={t('analytics.discounts')} value={formatKzt(-revenue.discounts)} />
        <Row label={t('analytics.refunds')} value={formatKzt(-revenue.refunds)} />
        <Row label={t('analytics.fees')} value={formatKzt(-revenue.processingFees)} />
        <Row label={t('analytics.netRevenue')} value={formatKzt(revenue.netRevenue)} strong />
        <Row label={t('analytics.payout')} value={formatKzt(revenue.estimatedPayout)} />
        <Text style={text.muted}>{t('analytics.ordersSummary', { confirmed: revenue.confirmedOrders, refunded: revenue.refundedOrders })}</Text>
      </Card>

      <Card>
        <Text style={text.heading}>{t('analytics.salesTitle')}</Text>
        {data.salesOverTime.length === 0 ? <Text style={text.muted}>{t('analytics.noSales')}</Text> : (
          <>
            <View accessibilityLabel={t('analytics.perDay')} style={styles.chart}>
              {data.salesOverTime.map((point) => (
                <View
                  key={point.date}
                  accessibilityLabel={t('analytics.pointTitle', { date: formatDate(point.date), count: point.ticketsSold, amount: formatKzt(point.netRevenue) })}
                  style={[styles.column, { height: `${Math.max((point.ticketsSold / peak) * 100, 3)}%` }]}
                />
              ))}
            </View>
            {data.salesOverTime.map((point) => <Row key={point.date} label={formatDate(point.date)} value={`${point.ticketsSold} · ${formatKzt(point.netRevenue)}`} />)}
          </>
        )}
      </Card>

      <Card>
        <Text style={text.heading}>{t('analytics.byTypeTitle')}</Text>
        {data.ticketTypes.length === 0 ? <Text style={text.muted}>{t('analytics.noTypes')}</Text> : data.ticketTypes.map((row) => (
          <View key={row.ticketTypeId} style={styles.typeRow}>
            <Row label={`${row.name} · ${row.price ? formatKzt(row.price) : t('event.free')}`} value={formatKzt(row.netRevenue)} strong />
            <Text style={text.muted}>{t('analytics.soldOfQuantity')}: {row.sold} / {row.quantity} · {t('analytics.reserved')}: {row.reserved} · {t('analytics.refunded')}: {row.refunded} · {t('analytics.checkedIn')}: {row.checkedIn}</Text>
            <Bar value={row.sold} max={topType} label={t('analytics.barLabel', { name: row.name, count: row.sold })} />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={text.heading}>{t('analytics.campaignsTitle')}</Text>
        {data.campaigns.length === 0 ? <Text style={text.muted}>{t('analytics.noCampaigns')}</Text> : data.campaigns.map((row) => (
          <View key={row.campaignId} style={styles.typeRow}>
            <Row label={`${row.code}${row.isEnabled ? '' : ` (${t('analytics.disabled')})`}`} value={formatKzt(row.netRevenue)} strong />
            <Text style={text.muted}>
              {t('analytics.linkVisits')}: {row.linkVisits} · {t('analytics.redemptions')}: {row.redemptions} · {t('analytics.tickets')}: {row.ticketsSold} · {t('analytics.gross')}: {formatKzt(row.grossRevenue)} · {t('analytics.discount')}: {formatKzt(row.discountTotal)}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  )
}

/** Read-only activity timeline (SRS 4.16): audit entries cannot be edited or deleted here. */
export function History({ event, onError }: TabProps) {
  const { t } = useLocale()
  const [types, setTypes] = useState<string[]>([])
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const activity = (value: string) => {
    const key = `activity.${value}`
    return isMessageKey(key) ? t(key) : humanize(value)
  }

  useEffect(() => { getActivityTypes().then(setTypes).catch(() => undefined) }, [])

  useEffect(() => {
    let active = true
    getEventHistory(event.id, { from: dayBoundary(from), to: dayBoundary(to, true), type: type || undefined })
      .then((value) => { if (active) setEntries(value) })
      .catch((err: unknown) => { if (active) onError(errorMessage(err, t('history.loadError'))) })
    return () => { active = false }
  }, [event.id, from, onError, t, to, type])

  return (
    <View style={styles.gap}>
      <Header title={t('history.title')} subtitle={t('history.text')} />
      <Card style={styles.gap}>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Select label={t('history.activity')} value={type} onChange={setType} options={[{ value: '', label: t('history.allActivity') }, ...types.map((value) => ({ value, label: activity(value) }))]} />
      </Card>
      {!entries ? <Loading label={t('history.loading')} /> : entries.length === 0 ? <Empty title={t('history.empty')} /> : (
        <View style={styles.timeline}>
          {entries.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <View style={styles.dot} />
              <Text style={text.muted}>{formatDateTime(entry.createdAt)} · {entry.actorEmail ?? t('history.system')}</Text>
              <Badge label={activity(entry.actionType)} tone="brand" />
              <Text style={text.body}>{entry.description}</Text>
              <Text style={text.muted}>{entry.entityType}{entry.entityId ? ` ${entry.entityId.slice(0, 8)}` : ''}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  dates: { flexDirection: 'row', gap: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brand, borderRadius: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  column: { flex: 1, backgroundColor: colors.brand, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  typeRow: { gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  timeline: { borderLeftWidth: 2, borderLeftColor: colors.line, marginLeft: 6, paddingLeft: 16, gap: 16 },
  entry: { gap: 4 },
  dot: { position: 'absolute', left: -23, top: 4, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand, borderWidth: 2, borderColor: '#ffffff' },
})
