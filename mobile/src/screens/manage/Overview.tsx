import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { updateEvent } from '../../api/events'
import { activatePaidSalesWithTerms, getPaidSalesChecklist, payActivationFee, verifyOrganizerSimulation, type PaidSalesChecklist } from '../../api/platform'
import { EventForm } from '../../components/EventForm'
import { Badge, Button, Card, Header, Notice, Toggle, colors, text } from '../../components/ui'
import { errorMessage, formatDateTime, formatKzt } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import type { TabProps } from './types'

export function Overview({ event, onEvent, onError, onMessage }: TabProps) {
  const { t } = useLocale()
  return (
    <View style={styles.gap}>
      <PaidSales event={event} onEvent={onEvent} onError={onError} onMessage={onMessage} />
      <Header title={t('manageEvent.detailsTitle')} subtitle={t('manageEvent.detailsText')} />
      <EventForm
        key={event.id}
        event={event}
        submitLabel={t('manageEvent.save')}
        onSubmit={async (input) => {
          onError('')
          onMessage('')
          onEvent(await updateEvent(event.id, input))
          onMessage(t('manageEvent.saved'))
        }}
      />
    </View>
  )
}

/** Paid-sales activation checklist (SRS 3.2, 4.5). Every step is a clearly labelled simulation. */
function PaidSales({ event, onEvent, onError, onMessage }: TabProps) {
  const { t } = useLocale()
  const [checklist, setChecklist] = useState<PaidSalesChecklist | null>(null)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getPaidSalesChecklist(event.id)
      .then((value) => { if (active) setChecklist(value) })
      .catch((err: unknown) => { if (active) onError(errorMessage(err, t('paidSales.loadError'))) })
    return () => { active = false }
  }, [event.id, onError, t])

  async function run(action: () => Promise<PaidSalesChecklist>, done: string) {
    onError('')
    onMessage('')
    setBusy(true)
    try {
      const next = await action()
      setChecklist(next)
      onEvent({ ...event, paidSalesStatus: next.paidSalesStatus })
      onMessage(done)
    } catch (err) {
      onError(errorMessage(err, t('paidSales.stepError')))
    } finally {
      setBusy(false)
    }
  }

  const status = checklist?.paidSalesStatus ?? event.paidSalesStatus ?? 'None'
  const verified = Boolean(checklist?.items.find((item) => item.key === 'identityVerification')?.completed)
  return (
    <Card style={styles.gap}>
      <Text style={text.heading}>{t('paidSales.title')}</Text>
      <Text style={text.muted}>{t('paidSales.text')}</Text>
      <View style={styles.row}>
        <Text style={text.body}>{t('paidSales.statusLabel')}:</Text>
        <Badge label={t(`paidSales.status.${status}`)} tone={status === 'Active' ? 'success' : status === 'Suspended' ? 'danger' : 'neutral'} />
      </View>
      {checklist?.activatedAt ? <Text style={text.muted}>{t('paidSales.activatedAt', { time: formatDateTime(checklist.activatedAt) })}</Text> : null}
      {status === 'Suspended' && <Notice tone="warning" message={t('paidSales.suspended')} />}
      {checklist?.items.map((item) => (
        <View key={item.key} style={styles.row} accessible accessibilityLabel={`${item.label} — ${item.completed ? t('paidSales.done') : t('paidSales.todo')}`}>
          <Text style={[styles.check, item.completed ? styles.checkDone : styles.checkTodo]}>{item.completed ? '✓' : '·'}</Text>
          <Text style={[text.body, styles.flex]}>{item.label}</Text>
        </View>
      ))}
      {checklist && status !== 'Active' && status !== 'Suspended' && (
        <View style={styles.gap}>
          <Button variant="secondary" disabled={busy || verified} label={verified ? t('paidSales.verified') : t('paidSales.verify')} onPress={() => void run(async () => { await verifyOrganizerSimulation(); return getPaidSalesChecklist(event.id) }, t('paidSales.verifiedMessage'))} />
          <Button variant="ghost" small label={t('paidSales.payoutHint', { link: t('paidSales.profileLink') })} onPress={() => router.push('/organizer-profile')} />
          <Button variant="secondary" disabled={busy || Boolean(checklist.feePaidAt)} label={checklist.feePaidAt ? t('paidSales.feePaid') : t('paidSales.payFee', { amount: formatKzt(checklist.activationFeeKzt) })} onPress={() => void run(() => payActivationFee(event.id), t('paidSales.feeMessage'))} />
          <Toggle label={t('paidSales.terms')} value={terms} onChange={setTerms} />
          <Button label={t('paidSales.activate')} busy={busy} disabled={!terms || !checklist.canActivate} onPress={() => void run(async () => (await activatePaidSalesWithTerms(event.id)).checklist, t('paidSales.activatedMessage'))} />
          {!checklist.canActivate && <Text style={text.muted}>{t('paidSales.remaining')}</Text>}
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontWeight: '800', overflow: 'hidden' },
  checkDone: { backgroundColor: colors.successSoft, color: colors.success },
  checkTodo: { backgroundColor: '#f1f5f9', color: colors.muted },
})
