import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { escalateSupportCase } from '../api/platform'
import { addSupportMessage, createSupportCase, getSupportCases, updateSupportCase, type SupportCase } from '../api/workflows'
import { SupportContextFields } from '../components/SupportContextFields'
import { Badge, Button, Card, Empty, ErrorText, Field, Header, Loading, Notice, Screen, Select, colors, text } from '../components/ui'
import { useAuth } from '../lib/auth'
import { errorMessage, formatDateTime } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'

// Category and status values are what the API stores; only their labels are translated.
const categoryKeys: Record<string, MessageKey> = {
  'Ticket delivery': 'support.categories.ticketDelivery',
  Payment: 'support.categories.payment',
  Refund: 'support.categories.refund',
  Seating: 'support.categories.seating',
  'Event information': 'support.categories.eventInfo',
  'Check-in': 'support.categories.checkIn',
  Account: 'support.categories.account',
  'Technical problem': 'support.categories.technical',
  Activation: 'support.categories.activation',
}
const attendeeCategories = ['Ticket delivery', 'Payment', 'Refund', 'Seating', 'Event information', 'Check-in', 'Account', 'Technical problem']
const organizerCategories = ['Account', 'Activation', 'Payment', 'Technical problem']
const statusKeys: Record<string, MessageKey> = {
  Open: 'support.status.open',
  'In Progress': 'support.status.inProgress',
  'Waiting for Customer': 'support.status.waiting',
  Resolved: 'support.status.resolved',
}

/** Support inbox: asynchronous case conversations with event, order and ticket context (SRS 4.13). */
export default function Support() {
  const { user } = useAuth()
  const { t } = useLocale()
  const params = useLocalSearchParams<{ caseId?: string; new?: string; eventId?: string; orderId?: string; ticketId?: string }>()
  const [cases, setCases] = useState<SupportCase[] | null>(null)
  const [selectedId, setSelectedId] = useState(params.caseId ?? '')
  const [createMode, setCreateMode] = useState(params.new === '1')
  const [category, setCategory] = useState('')
  // Chosen in the form when it was not opened from an event, order or ticket.
  const [contextEvent, setContextEvent] = useState('')
  const [contextOrder, setContextOrder] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isStaff = user?.role === 'PlatformAdmin' || user?.role === 'Organizer'
  const canOpenCase = user?.role === 'Attendee' || user?.role === 'Organizer' || user?.role === 'EventAdmin'
  const categories = user?.role === 'Organizer' ? organizerCategories : attendeeCategories
  const label = (map: Record<string, MessageKey>, value: string) => (map[value] ? t(map[value]) : value)

  const refresh = useCallback(async () => {
    try {
      setCases(await getSupportCases())
    } catch (err) {
      setError(errorMessage(err, t('support.loadError')))
      setCases((current) => current ?? [])
    }
  }, [t])

  // There is no push channel (SRS 4.13), so replies are fetched every 30 seconds.
  useEffect(() => {
    let active = true
    getSupportCases()
      .then((rows) => { if (active) setCases(rows) })
      .catch((err: unknown) => { if (active) { setError(errorMessage(err, t('support.loadError'))); setCases([]) } })
    const timer = setInterval(() => void refresh(), 30_000)
    return () => { active = false; clearInterval(timer) }
  }, [refresh, t])

  const active = cases?.find((item) => item.id === selectedId) ?? null

  async function openCase() {
    if (!subject.trim() || !message.trim()) {
      setError(t('auth.required'))
      return
    }
    setError('')
    setBusy(true)
    try {
      const created = await createSupportCase({
        category: category || categories[0],
        subject: subject.trim(),
        message: message.trim(),
        eventId: params.eventId || contextEvent || undefined,
        orderId: params.orderId || contextOrder || undefined,
        ticketId: params.ticketId || undefined,
      })
      await refresh()
      setSelectedId(created.id)
      setCreateMode(false)
      setSubject('')
      setMessage('')
      setContextEvent('')
      setContextOrder('')
    } catch (err) {
      setError(errorMessage(err, t('support.openError')))
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<unknown>, failure: MessageKey) {
    setError('')
    setBusy(true)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(errorMessage(err, t(failure)))
    } finally {
      setBusy(false)
    }
  }

  if (!cases) return <Loading label={t('support.loading')} />

  if (createMode) {
    const related = [params.eventId && t('support.relatedEvent'), params.orderId && t('support.relatedOrder'), params.ticketId && t('support.relatedTicket')].filter(Boolean).join(', ')
    return (
      <Screen>
        <Header title={t('support.formTitle')} subtitle={t('support.formText')} />
        <Card style={styles.gap}>
          <Select label={t('support.categoryLabel')} value={category || categories[0]} onChange={setCategory} options={categories.map((value) => ({ value, label: label(categoryKeys, value) }))} />
          <Field label={t('support.subject')} value={subject} onChangeText={setSubject} maxLength={200} />
          <Field label={t('support.message')} value={message} onChangeText={setMessage} maxLength={4000} multiline />
          {related
            ? <Notice tone="info" message={t('support.relatedNote', { items: related })} />
            : <SupportContextFields organizer={user?.role === 'Organizer'} eventId={contextEvent} orderId={contextOrder} onEvent={setContextEvent} onOrder={setContextOrder} />}
          <ErrorText message={error} />
          <Button label={busy ? t('forgot.submitting') : t('support.submit')} busy={busy} onPress={() => void openCase()} />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setCreateMode(false)} />
        </Card>
      </Screen>
    )
  }

  if (active) {
    return (
      <Screen onRefresh={() => void refresh()}>
        <Stack.Screen options={{ title: active.subject }} />
        <Button label={`← ${t('support.conversations')}`} variant="ghost" style={styles.back} onPress={() => setSelectedId('')} />
        <Header kicker={label(categoryKeys, active.category)} title={active.subject} subtitle={`${t('support.updated', { time: formatDateTime(active.updatedAt) })}${active.isEscalated ? ` · ${t('support.escalated')}` : ''}`} />
        <View style={styles.chips}>
          {active.eventId && <Button small variant="secondary" label={t('support.event')} onPress={() => router.push(`/events/${active.eventId}`)} />}
          {active.orderId && <Badge label={`${t('orders.order')} ${active.orderId.slice(0, 8)}`} />}
          {active.ticketId && <Badge label={`${t('support.ticket')} ${active.ticketId.slice(0, 8)}`} />}
        </View>
        {isStaff && (
          <Select label={t('support.statusLabel')} value={active.status} onChange={(status) => void run(() => updateSupportCase(active.id, status), 'support.statusError')} options={Object.keys(statusKeys).map((value) => ({ value, label: label(statusKeys, value) }))} />
        )}
        {!isStaff && <Badge label={label(statusKeys, active.status)} tone={active.status === 'Resolved' ? 'success' : 'brand'} />}
        {!active.isEscalated && active.type === 'Attendee' && active.status !== 'Resolved' && user?.role !== 'PlatformAdmin' && (
          <Button small variant="secondary" label={t('support.escalate')} onPress={() => void run(() => escalateSupportCase(active.id, ''), 'support.escalateError')} />
        )}
        <ErrorText message={error} />
        {active.messages.map((item) => {
          const own = item.senderUserId === user?.id
          return (
            <View key={item.id} style={[styles.bubble, own ? styles.own : styles.other]}>
              <Text style={[styles.meta, own && styles.ownText]}>{own ? t('support.you') : item.senderRole} · {formatDateTime(item.createdAt)}</Text>
              <Text style={[text.body, own && styles.ownText]}>{item.body}</Text>
            </View>
          )
        })}
        {active.status !== 'Resolved' ? (
          <Card style={styles.gap}>
            <Field label={t('support.replyPlaceholder')} value={reply} onChangeText={setReply} maxLength={4000} multiline />
            <Button label={t('support.sendReply')} busy={busy} disabled={!reply.trim()} onPress={() => void run(async () => { await addSupportMessage(active.id, reply.trim()); setReply('') }, 'support.replyError')} />
          </Card>
        ) : <Text style={text.muted}>{t('support.resolved')}</Text>}
      </Screen>
    )
  }

  return (
    <Screen onRefresh={() => void refresh()}>
      <Header kicker={t('support.kicker')} title={t('support.title')} subtitle={t('support.subtitle')} />
      {canOpenCase && <Button label={t('support.new')} onPress={() => setCreateMode(true)} />}
      <ErrorText message={error} />
      <Text style={text.heading}>{t('support.conversations')} ({cases.length})</Text>
      {cases.length === 0 ? <Empty title={canOpenCase ? t('support.empty') : t('support.emptyStaff')} /> : cases.map((item) => (
        <Pressable key={item.id} accessibilityRole="button" onPress={() => setSelectedId(item.id)}>
          <Card>
            <View style={styles.caseHead}>
              <Text style={[text.subheading, styles.flex]}>{item.subject}</Text>
              <Badge label={label(statusKeys, item.status)} tone={item.status === 'Resolved' ? 'success' : 'brand'} />
            </View>
            <Text style={text.muted}>{label(categoryKeys, item.category)} · {formatDateTime(item.updatedAt)}</Text>
            <Text style={text.muted} numberOfLines={2}>{item.messages.at(-1)?.body}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  caseHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: 16, padding: 12, gap: 4 },
  own: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  other: { alignSelf: 'flex-start', backgroundColor: '#e2e8f0' },
  ownText: { color: '#ffffff' },
  meta: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
})
