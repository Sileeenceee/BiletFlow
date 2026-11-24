import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { getAttendees, type Attendee } from '../../api/events'
import { assignEventStaff, getEventStaff, removeEventStaff, type StaffAssignment } from '../../api/workflows'
import { Badge, Button, Card, Empty, Field, Header, Loading, colors, text } from '../../components/ui'
import { errorMessage, formatDateTime } from '../../lib/format'
import { enumLabel, useLocale } from '../../lib/i18n'
import type { TabProps } from './types'

export function Attendees({ event, onError }: TabProps) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Attendee[] | null>(null)

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      getAttendees(event.id, search.trim())
        .then((value) => { if (active) setRows(value) })
        .catch((err: unknown) => { if (active) onError(errorMessage(err, t('manageEvent.attendeesLoadError'))) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [event.id, onError, search, t])

  return (
    <View style={styles.gap}>
      <Header title={t('manageEvent.attendeesTitle')} subtitle={t('manageEvent.attendeesText')} />
      <TextInput accessibilityLabel={t('manageEvent.searchAttendees')} value={search} onChangeText={setSearch} placeholder={t('manageEvent.searchAttendees')} placeholderTextColor={colors.muted} autoCapitalize="none" style={text.input} />
      {!rows ? <Loading label={t('manageEvent.searching')} /> : rows.length === 0 ? <Empty title={t('manageEvent.noAttendees')} /> : rows.map((row) => (
        <Card key={row.ticketId}>
          <Text style={text.subheading}>{row.attendeeName}</Text>
          <Text style={text.muted}>{row.attendeeEmail}</Text>
          <View style={styles.row}>
            <Text style={[text.body, styles.flex]}>{row.ticketTypeName}</Text>
            <Badge label={enumLabel(t, `orders.ticketStatus.${row.status}`, row.status)} tone={row.status === 'CheckedIn' ? 'success' : row.status === 'Valid' ? 'brand' : 'danger'} />
          </View>
          <Text style={text.muted}>{t('orders.order')} {row.orderId.slice(0, 8)}</Text>
        </Card>
      ))}
    </View>
  )
}

export function Team({ event, onError, onMessage }: TabProps) {
  const { t } = useLocale()
  const [staff, setStaff] = useState<StaffAssignment[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getEventStaff(event.id).then(setStaff).catch((err: unknown) => onError(errorMessage(err, t('manageEvent.staffLoadError'))))
  }, [event.id, onError, t])

  async function assign() {
    onError('')
    onMessage('')
    setBusy(true)
    try {
      await assignEventStaff(event.id, email.trim())
      setEmail('')
      setStaff(await getEventStaff(event.id))
      onMessage(t('manageEvent.staffAssigned'))
    } catch (err) {
      onError(errorMessage(err, t('manageEvent.assignError')))
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string) {
    onError('')
    try {
      await removeEventStaff(event.id, userId)
      setStaff((current) => current.filter((row) => row.userId !== userId))
      onMessage(t('manageEvent.staffRemoved'))
    } catch (err) {
      onError(errorMessage(err, t('manageEvent.removeError')))
    }
  }

  return (
    <View style={styles.gap}>
      <Header title={t('manageEvent.staffTitle')} subtitle={t('manageEvent.staffText')} />
      {staff.length === 0 ? <Empty title={t('manageEvent.noStaff')} /> : staff.map((row) => (
        <Card key={row.userId} style={styles.staff}>
          <View style={styles.flex}>
            <Text style={text.subheading}>{row.email}</Text>
            <Text style={text.muted}>{t('manageEvent.assignedAt', { time: formatDateTime(row.assignedAt) })}</Text>
          </View>
          <Button small variant="danger" label={t('common.remove')} onPress={() => void remove(row.userId)} />
        </Card>
      ))}
      <Card style={styles.gap}>
        <Text style={text.heading}>{t('manageEvent.assignTitle')}</Text>
        <Text style={text.muted}>{t('manageEvent.assignText')}</Text>
        <Field label={t('manageEvent.accountEmail')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Button label={busy ? t('manageEvent.assigning') : t('manageEvent.assign')} busy={busy} disabled={!email.trim()} onPress={() => void assign()} />
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staff: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
