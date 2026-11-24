import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import * as api from '../../api/admin'
import { useReasonDialog } from '../../components/ReasonDialog'
import { Badge, Button, Card, Empty, Field, Header, Loading, Row, Select, Stat, colors, text } from '../../components/ui'
import { shareApiFile } from '../../lib/files'
import { errorMessage, formatDateTime, formatKzt, formatNumber } from '../../lib/format'
import { enumLabel, useLocale } from '../../lib/i18n'

export type Notify = { onError: (value: string) => void; onMessage: (value: string) => void }

/** Runs an admin action, reports the outcome and reloads the list. */
function useAction({ onError, onMessage }: Notify, reload: () => Promise<unknown>) {
  const { t } = useLocale()
  return async (action: () => Promise<unknown>, done: string) => {
    onError('')
    onMessage('')
    try {
      await action()
      onMessage(done)
      await reload()
    } catch (err) {
      onError(errorMessage(err, t('admin.actionError')))
    }
  }
}

export function Overview({ onError }: Notify) {
  const { t } = useLocale()
  const [data, setData] = useState<api.AdminOverview | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    api.getOverview().then(setData).catch((err: unknown) => onError(errorMessage(err, t('admin.overview.loadError'))))
  }, [onError, t])

  async function download(type: string) {
    setBusy(type)
    try {
      await shareApiFile(`/api/admin/exports/${type}`, `biletflow-${type}.csv`, 'text/csv')
    } catch (err) {
      onError(errorMessage(err, t('admin.exportError')))
    } finally {
      setBusy('')
    }
  }

  if (!data) return <Loading label={t('admin.overview.loading')} />
  return (
    <View style={styles.gap}>
      <View style={styles.stats}>
        <Stat label={t('admin.tab.Users')} value={formatNumber(data.users)} hint={t('admin.stat.usersHint', { organizers: data.organizers, suspended: data.suspendedUsers })} />
        <Stat label={t('admin.tab.Events')} value={formatNumber(data.events)} hint={t('admin.stat.eventsHint', { published: data.publishedEvents, suspended: data.suspendedEvents })} />
        <Stat label={t('admin.tab.Orders')} value={formatNumber(data.orders)} hint={t('admin.stat.ordersHint', { failed: data.failedPayments, refunds: data.refunds })} />
        <Stat label={t('admin.stat.gross')} value={formatKzt(data.simulatedGrossVolume)} />
        <Stat label={t('admin.stat.openReports')} value={formatNumber(data.openReports)} />
        <Stat label={t('admin.stat.escalated')} value={formatNumber(data.escalatedSupportCases)} />
      </View>
      <Card style={styles.gap}>
        <Text style={text.heading}>{t('admin.exportsTitle')}</Text>
        {api.exportTypes.map((type) => (
          <Button key={type} variant="secondary" busy={busy === type} label={busy === type ? t('admin.preparing') : t(`admin.export.${type}`)} onPress={() => void download(type)} />
        ))}
      </Card>
    </View>
  )
}

export function Users(notify: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [rows, setRows] = useState<api.AdminUser[] | null>(null)
  const { onError } = notify

  const load = useCallback(() => api.getUsers(search, role).then(setRows)
    .catch((err: unknown) => onError(errorMessage(err, t('admin.users.loadError')))), [onError, role, search, t])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300)
    return () => clearTimeout(timer)
  }, [load])
  const act = useAction(notify, load)
  const roles = ['Attendee', 'Organizer', 'EventAdmin', 'PlatformAdmin']

  return (
    <View style={styles.gap}>
      {dialog}
      <TextInput accessibilityLabel={t('admin.users.search')} value={search} onChangeText={setSearch} placeholder={t('admin.users.searchPlaceholder')} placeholderTextColor={colors.muted} autoCapitalize="none" style={text.input} />
      <Select label={t('admin.users.roleFilter')} value={role} onChange={setRole} options={[{ value: '', label: t('admin.users.allRoles') }, ...roles.map((value) => ({ value, label: t(`role.${value as 'Attendee'}`) }))]} />
      {!rows ? <Loading label={t('admin.loading')} /> : rows.length === 0 ? <Empty title={t('admin.empty')} /> : rows.map((user) => (
        <Card key={user.id}>
          <Text style={text.subheading}>{user.email}</Text>
          {user.fullName ? <Text style={text.muted}>{user.fullName}</Text> : null}
          <View style={styles.row}>
            <Badge label={user.isSuspended ? t('admin.users.suspended') : t('admin.users.active')} tone={user.isSuspended ? 'danger' : 'success'} />
            <Badge label={user.emailConfirmed ? t('admin.col.verified') : '—'} />
          </View>
          <Text style={text.muted}>{t('admin.col.joined')}: {formatDateTime(user.createdAt)}</Text>
          <Select
            label={t('admin.users.roleOf', { email: user.email })}
            value={user.role}
            onChange={(value) => void act(() => api.changeUserRole(user.id, value), t('admin.users.roleChanged', { email: user.email }))}
            options={roles.filter((value) => value !== 'EventAdmin' || user.role === 'EventAdmin').map((value) => ({ value, label: t(`role.${value as 'Attendee'}`) }))}
          />
          {user.isSuspended
            ? <Button small variant="secondary" label={t('admin.users.reinstate')} onPress={() => void act(() => api.reinstateUser(user.id), t('admin.users.reinstated', { email: user.email }))} />
            : <Button small variant="danger" label={t('admin.users.suspend')} onPress={() => void ask(t('admin.users.suspendConfirm', { email: user.email })).then((reason) => {
              if (reason !== null) void act(() => api.suspendUser(user.id, reason), t('admin.users.suspendedMessage', { email: user.email }))
            })} />}
        </Card>
      ))}
    </View>
  )
}

export function Events(notify: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<api.AdminEvent[] | null>(null)
  const { onError } = notify

  const load = useCallback(() => api.getAdminEvents(search, status).then(setRows)
    .catch((err: unknown) => onError(errorMessage(err, t('admin.events.loadError')))), [onError, search, status, t])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300)
    return () => clearTimeout(timer)
  }, [load])
  const act = useAction(notify, load)
  const withReason = async (title: string, action: (reason: string) => Promise<unknown>, done: string) => {
    const reason = await ask(title)
    if (reason !== null) await act(() => action(reason), done)
  }

  return (
    <View style={styles.gap}>
      {dialog}
      <TextInput accessibilityLabel={t('admin.events.searchPlaceholder')} value={search} onChangeText={setSearch} placeholder={t('admin.events.searchPlaceholder')} placeholderTextColor={colors.muted} style={text.input} />
      <Select label={t('admin.events.statusFilter')} value={status} onChange={setStatus} options={[
        { value: '', label: t('admin.allStatuses') },
        { value: 'suspended', label: t('admin.events.suspended') },
        { value: 'reported', label: t('admin.events.reported') },
        { value: 'published', label: t('events.published') },
        { value: 'cancelled', label: t('events.cancelled') },
      ]} />
      {!rows ? <Loading label={t('admin.loading')} /> : rows.length === 0 ? <Empty title={t('admin.empty')} /> : rows.map((event) => (
        <Card key={event.id}>
          <Text style={text.subheading} onPress={() => router.push(`/events/${event.id}`)}>{event.title}</Text>
          <Text style={text.muted}>{formatDateTime(event.startDateUtc)} · {enumLabel(t, `admin.visibility.${event.visibility}`, event.visibility)}</Text>
          <Text style={text.muted}>{event.organizerEmail}</Text>
          <View style={styles.row}>
            <Badge label={event.isSuspended ? t('admin.events.suspended') : enumLabel(t, `admin.lifecycle.${event.lifecycleStatus}`, event.lifecycleStatus)} tone={event.isSuspended ? 'danger' : 'brand'} />
            {!event.isPublished && <Badge label={t('events.draft')} tone="warning" />}
          </View>
          <Row label={t('admin.col.paidSales')} value={enumLabel(t, `paidSales.status.${event.paidSalesStatus}`, event.paidSalesStatus)} />
          <Row label={t('manageEvent.tickets')} value={String(event.ticketsIssued)} />
          <Row label={t('admin.col.reports')} value={String(event.openReports)} />
          <View style={styles.actions}>
            {event.isSuspended
              ? <Button small variant="secondary" label={t('admin.events.reinstate')} onPress={() => void act(() => api.reinstateEvent(event.id), t('admin.events.reinstated', { title: event.title }))} />
              : <Button small variant="danger" label={t('admin.events.suspend')} onPress={() => void withReason(t('admin.events.suspendConfirm', { title: event.title }), (reason) => api.suspendEvent(event.id, reason), t('admin.events.suspendedMessage', { title: event.title }))} />}
            {event.paidSalesStatus === 'Active' && <Button small variant="danger" label={t('admin.events.suspendPaid')} onPress={() => void withReason(t('admin.events.suspendPaidConfirm', { title: event.title }), (reason) => api.suspendPaidSales(event.id, reason), t('admin.events.paidSuspended'))} />}
            {event.paidSalesStatus === 'Suspended' && <Button small variant="secondary" label={t('admin.events.reinstatePaid')} onPress={() => void act(() => api.reinstatePaidSales(event.id), t('admin.events.paidReinstated'))} />}
            <Button small variant="ghost" label={t('manageEvent.tab.History')} onPress={() => router.push({ pathname: '/events/[id]/manage', params: { id: event.id, tab: 'History' } })} />
          </View>
        </Card>
      ))}
    </View>
  )
}

export function Reports(notify: Notify) {
  const { t } = useLocale()
  const { dialog, ask } = useReasonDialog()
  const [status, setStatus] = useState('Open')
  const [rows, setRows] = useState<api.EventReport[] | null>(null)
  const { onError } = notify

  const load = useCallback(() => api.getReports(status).then(setRows)
    .catch((err: unknown) => onError(errorMessage(err, t('admin.reports.loadError')))), [onError, status, t])
  useEffect(() => { void load() }, [load])
  const act = useAction(notify, load)

  async function resolve(report: api.EventReport, outcome: 'Dismissed' | 'ActionTaken', suspendEvent: boolean) {
    const title = suspendEvent ? t('admin.reports.suspendConfirm', { title: report.eventTitle })
      : outcome === 'Dismissed' ? t('admin.reports.dismissConfirm', { title: report.eventTitle }) : t('admin.reports.actionConfirm', { title: report.eventTitle })
    const note = await ask(title)
    if (note !== null) await act(() => api.resolveReport(report.id, { status: outcome, note, suspendEvent }), t('admin.reports.resolved', { title: report.eventTitle }))
  }

  return (
    <View style={styles.gap}>
      {dialog}
      <Header title={t('admin.reports.title')} />
      <Select label={t('admin.reports.filter')} value={status} onChange={setStatus} options={[
        { value: 'Open', label: t('admin.reportStatus.Open') },
        { value: 'ActionTaken', label: t('admin.reportStatus.ActionTaken') },
        { value: 'Dismissed', label: t('admin.reportStatus.Dismissed') },
        { value: '', label: t('admin.allStatuses') },
      ]} />
      {!rows ? <Loading label={t('admin.loading')} /> : rows.length === 0 ? <Empty title={t('admin.empty')} /> : rows.map((report) => (
        <Card key={report.id}>
          <Text style={text.subheading} onPress={() => router.push(`/events/${report.eventId}`)}>{report.eventTitle}</Text>
          <Text style={text.muted}>{report.reporterEmail} · {formatDateTime(report.createdAt)}</Text>
          <Text style={text.body}>{report.reason}</Text>
          {report.details ? <Text style={text.muted}>{report.details}</Text> : null}
          {report.resolutionNote ? <Text style={text.muted}>{t('admin.reports.note', { note: report.resolutionNote })}</Text> : null}
          <Badge label={enumLabel(t, `admin.reportStatus.${report.status}`, report.status)} tone={report.status === 'Open' ? 'warning' : 'neutral'} />
          {report.status === 'Open' && (
            <View style={styles.actions}>
              <Button small variant="danger" label={t('admin.events.suspend')} onPress={() => void resolve(report, 'ActionTaken', true)} />
              <Button small variant="secondary" label={t('admin.reports.markAction')} onPress={() => void resolve(report, 'ActionTaken', false)} />
              <Button small variant="ghost" label={t('admin.reports.dismiss')} onPress={() => void resolve(report, 'Dismissed', false)} />
            </View>
          )}
        </Card>
      ))}
    </View>
  )
}

export function Settings({ onError, onMessage }: Notify) {
  const { t } = useLocale()
  const [settings, setSettings] = useState<api.PlatformSettings | null>(null)
  const [draft, setDraft] = useState({ activationFeeKzt: '', processingFeePercent: '', processingFeeFixedKzt: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getSettings()
      .then((value) => {
        setSettings(value)
        setDraft({ activationFeeKzt: String(value.activationFeeKzt), processingFeePercent: String(value.processingFeePercent), processingFeeFixedKzt: String(value.processingFeeFixedKzt) })
      })
      .catch((err: unknown) => onError(errorMessage(err, t('admin.settings.loadError'))))
  }, [onError, t])

  async function save() {
    onError('')
    setBusy(true)
    try {
      setSettings(await api.saveSettings({
        activationFeeKzt: Number(draft.activationFeeKzt),
        processingFeePercent: Number(draft.processingFeePercent.replace(',', '.')),
        processingFeeFixedKzt: Number(draft.processingFeeFixedKzt),
      }))
      onMessage(t('admin.settings.saved'))
    } catch (err) {
      onError(errorMessage(err, t('admin.settings.saveError')))
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <Loading label={t('admin.settings.loading')} />
  const set = (key: keyof typeof draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }))
  return (
    <Card style={styles.gap}>
      <Text style={text.heading}>{t('admin.settings.title')}</Text>
      <Field label={t('admin.settings.activationFee', { currency: settings.currency })} value={draft.activationFeeKzt} onChangeText={set('activationFeeKzt')} keyboardType="number-pad" />
      <Field label={t('admin.settings.processingFee')} value={draft.processingFeePercent} onChangeText={set('processingFeePercent')} keyboardType="decimal-pad" />
      <Field label={t('admin.settings.fixedFee', { currency: settings.currency })} value={draft.processingFeeFixedKzt} onChangeText={set('processingFeeFixedKzt')} keyboardType="number-pad" />
      <Button label={busy ? t('common.saving') : t('admin.settings.save')} busy={busy} onPress={() => void save()} />
      <Text style={text.muted}>{t('admin.settings.updated', { time: formatDateTime(settings.updatedAt) })}</Text>
    </Card>
  )
}

export const styles = StyleSheet.create({
  gap: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
})
