import { router } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Text, TextInput, View } from 'react-native'
import * as api from '../../api/admin'
import type { SupportCase } from '../../api/workflows'
import { Badge, Button, Card, Empty, Header, Loading, Row, Select, Toggle, colors, text } from '../../components/ui'
import { errorMessage, formatDateTime, formatKzt } from '../../lib/format'
import { enumLabel, useLocale, type TranslationKey } from '../../lib/i18n'
import { styles, type Notify } from './Moderation'

/** Loads a list again whenever its inputs change, a little after the last keystroke. */
function useList<T>(load: (signal: AbortSignal) => Promise<T[]>, deps: unknown[], onError: (value: string) => void, failure: string) {
  const [rows, setRows] = useState<T[] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      load(controller.signal).then(setRows).catch((err: unknown) => {
        if (!controller.signal.aborted) onError(errorMessage(err, failure))
      })
    }, 300)
    return () => { controller.abort(); clearTimeout(timer) }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return rows
}

function List<T>({ rows, render, title }: { rows: T[] | null; render: (row: T) => ReactNode; title?: string }) {
  const { t } = useLocale()
  return (
    <View style={styles.gap}>
      {title ? <Header title={title} /> : null}
      {!rows ? <Loading label={t('admin.loading')} /> : rows.length === 0 ? <Empty title={t('admin.empty')} /> : rows.map(render)}
    </View>
  )
}

function Filters({ search, onSearch, status, onStatus, statuses, searchLabel, filterLabel }: {
  search: string; onSearch: (v: string) => void; status: string; onStatus: (v: string) => void
  statuses: { value: string; label: string }[]; searchLabel: string; filterLabel: string
}) {
  const { t } = useLocale()
  return (
    <>
      <TextInput accessibilityLabel={searchLabel} value={search} onChangeText={onSearch} placeholder={t('admin.searchPlaceholder')} placeholderTextColor={colors.muted} autoCapitalize="none" style={text.input} />
      <Select label={filterLabel} value={status} onChange={onStatus} options={[{ value: '', label: t('admin.allStatuses') }, ...statuses]} />
    </>
  )
}

export function Orders({ onError }: Notify) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const rows = useList((signal) => api.getAdminOrders(search, status, signal), [search, status], onError, t('admin.orders.loadError'))
  const statuses = ['Pending', 'Confirmed', 'Cancelled', 'Refunded'].map((value) => ({ value, label: enumLabel(t, `orders.status.${value}`, value) }))
  return (
    <View style={styles.gap}>
      <Filters search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={statuses} searchLabel={t('admin.orders.search')} filterLabel={t('admin.orders.filter')} />
      <List rows={rows} render={(order: api.AdminOrder) => (
        <Card key={order.id}>
          <Row label={`${t('orders.order')} ${order.id.slice(0, 8)}`} value={formatKzt(order.total)} strong />
          <Text style={text.body}>{order.eventTitle}</Text>
          <Text style={text.muted}>{order.attendeeEmail} · {formatDateTime(order.createdAt)}</Text>
          <View style={styles.row}>
            <Badge label={enumLabel(t, `orders.status.${order.status}`, order.status)} />
            {order.promoCode ? <Badge label={`${t('admin.col.promo')}: ${order.promoCode}`} tone="brand" /> : null}
          </View>
        </Card>
      )} />
    </View>
  )
}

export function Payments({ onError }: Notify) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const rows = useList((signal) => api.getPayments(search, status, signal), [search, status], onError, t('admin.payments.loadError'))
  const statuses = ['Pending', 'Succeeded', 'Failed'].map((value) => ({ value, label: enumLabel(t, `admin.paymentStatus.${value}`, value) }))
  return (
    <View style={styles.gap}>
      <Filters search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={statuses} searchLabel={t('admin.payments.search')} filterLabel={t('admin.payments.filter')} />
      <List rows={rows} render={(payment: api.AdminPayment) => (
        <Card key={payment.id}>
          <Row label={`${t('orders.order')} ${payment.orderId.slice(0, 8)}`} value={`${formatKzt(payment.amount)}${payment.isSimulated ? ` (${t('admin.simulated')})` : ''}`} strong />
          <Text style={text.body}>{payment.eventTitle}</Text>
          <Text style={text.muted}>{payment.attendeeEmail} · {formatDateTime(payment.createdAt)}</Text>
          <Badge label={enumLabel(t, `admin.paymentStatus.${payment.status}`, payment.status)} tone={payment.status === 'Failed' ? 'danger' : payment.status === 'Succeeded' ? 'success' : 'warning'} />
        </Card>
      )} />
    </View>
  )
}

export function Refunds({ onError }: Notify) {
  const { t } = useLocale()
  const rows = useList(() => api.getRefunds(), [], onError, t('admin.refunds.loadError'))
  return (
    <List rows={rows} title={t('admin.tab.Refunds')} render={(refund: api.AdminRefund) => (
      <Card key={refund.id}>
        <Row label={`${t('orders.order')} ${refund.orderId.slice(0, 8)}`} value={`${formatKzt(refund.amount)}${refund.isSimulated ? ` (${t('admin.simulated')})` : ''}`} strong />
        <Text style={text.muted}>{refund.reason ?? '—'} · {formatDateTime(refund.createdAt)}</Text>
      </Card>
    )} />
  )
}

export function Activations({ onError }: Notify) {
  const { t } = useLocale()
  const rows = useList(() => api.getActivations(), [], onError, t('admin.activations.loadError'))
  const when = (value: string | null) => (value ? formatDateTime(value) : '—')
  return (
    <List rows={rows} title={t('admin.activations.title')} render={(row: api.AdminActivation) => (
      <Card key={row.id}>
        <Text style={text.subheading}>{row.eventTitle}</Text>
        <Text style={text.muted}>{row.organizerEmail}</Text>
        <Row label={t('admin.col.verified')} value={row.organizerVerified ? t('admin.yes') : t('admin.no')} />
        <Row label={t('admin.col.state')} value={enumLabel(t, `paidSales.status.${row.paidSalesStatus}`, row.paidSalesStatus)} />
        <Row label={t('admin.col.fee')} value={formatKzt(row.feeAmount)} />
        <Row label={t('admin.col.feePaid')} value={when(row.feePaidAt)} />
        <Row label={t('admin.col.terms')} value={when(row.termsAcceptedAt)} />
        <Row label={t('admin.col.activated')} value={when(row.activatedAt)} />
      </Card>
    )} />
  )
}

export function Promo({ onError }: Notify) {
  const { t } = useLocale()
  const rows = useList(() => api.getPromoActivity(), [], onError, t('admin.promo.loadError'))
  return (
    <List rows={rows} title={t('admin.promo.title')} render={(row: api.AdminPromoActivity) => (
      <Card key={row.campaignId}>
        <View style={styles.row}>
          <Text style={text.subheading}>{row.code}</Text>
          <Badge label={row.isEnabled ? t('admin.promo.enabled') : t('admin.promo.disabled')} tone={row.isEnabled ? 'success' : 'neutral'} />
        </View>
        <Text style={text.muted}>{row.eventTitle}</Text>
        <Row label={t('analytics.redemptions')} value={`${row.redemptions}${row.maxRedemptions ? ` / ${row.maxRedemptions}` : ''}`} />
        <Row label={t('analytics.linkVisits')} value={String(row.linkVisits)} />
        <Row label={t('admin.col.discountGiven')} value={formatKzt(row.discountTotal)} />
      </Card>
    )} />
  )
}

const caseStatusKeys: Record<string, TranslationKey> = {
  Open: 'support.status.open',
  'In Progress': 'support.status.inProgress',
  'Waiting for Customer': 'support.status.waiting',
  Resolved: 'support.status.resolved',
}

export function Support({ onError }: Notify) {
  const { t } = useLocale()
  const [escalated, setEscalated] = useState(true)
  const rows = useList(() => api.getAdminSupportCases(escalated), [escalated], onError, t('admin.support.loadError'))
  return (
    <View style={styles.gap}>
      <Header title={t('admin.support.title')} />
      <Toggle label={t('admin.support.escalatedOnly')} value={escalated} onChange={setEscalated} />
      <List rows={rows} render={(item: SupportCase) => (
        <Card key={item.id}>
          <Text style={text.subheading}>{item.subject}</Text>
          <Text style={text.muted}>{item.type}{item.isEscalated ? ` · ${t('admin.support.escalated')}` : ''} · {item.category} · {formatDateTime(item.updatedAt)}</Text>
          <Badge label={caseStatusKeys[item.status] ? t(caseStatusKeys[item.status]) : item.status} tone="brand" />
          <Button small variant="secondary" label={t('admin.support.open')} onPress={() => router.push({ pathname: '/support', params: { caseId: item.id } })} />
        </Card>
      )} />
    </View>
  )
}
