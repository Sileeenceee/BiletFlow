import { CameraView, useCameraPermissions } from 'expo-camera'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native'
import {
  checkIn, getSummary, reverseCheckIn, searchAttendees, validateTicket,
  type AssignedEvent, type Attendee, type Summary, type Verification,
} from '../api'
import { Button, Card, colors, ErrorText, formatDateTime, text } from '../ui'

type Tab = 'Scan' | 'Attendees'

// Each outcome has its own colour, symbol and wording, so it is clear at a glance and without colour (SRS 4.8).
const outcomes: Record<Verification['result'], { title: string; symbol: string; color: string; soft: string }> = {
  CheckedIn: { title: 'Admitted', symbol: '✓', color: colors.success, soft: colors.successSoft },
  Valid: { title: 'Valid ticket', symbol: '✓', color: colors.success, soft: colors.successSoft },
  AlreadyUsed: { title: 'Already used', symbol: '!', color: colors.warning, soft: colors.warningSoft },
  Invalid: { title: 'Not valid', symbol: '×', color: colors.danger, soft: colors.dangerSoft },
}

/** Says why a ticket was rejected in one or two words: Cancelled, Refunded or Invalid. */
function outcomeTitle(result: Verification): string {
  if (result.result === 'Invalid' && (result.ticketStatus === 'Cancelled' || result.ticketStatus === 'Refunded')) {
    return result.ticketStatus
  }
  return outcomes[result.result].title
}

export function EventScreen({ event, onBack }: { event: AssignedEvent; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('Scan')
  const [summary, setSummary] = useState<Summary | null>(null)

  const refreshSummary = useCallback(() => {
    getSummary(event.id).then(setSummary).catch(() => undefined)
  }, [event.id])

  // Other scanners at the same event change the totals, so they are re-read every 15 seconds.
  useEffect(() => {
    refreshSummary()
    const timer = setInterval(refreshSummary, 15_000)
    return () => clearInterval(timer)
  }, [refreshSummary])

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to events" onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>← Events</Text>
        </Pressable>
        <Text style={text.heading} numberOfLines={2}>{event.title}</Text>
        <Text style={text.muted}>{formatDateTime(event.startDateUtc)} · {[event.venue, event.city].filter(Boolean).join(', ')}</Text>
      </View>

      <Card style={styles.summary}>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{summary?.checkedIn ?? '–'}</Text><Text style={text.muted}>Checked in</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{summary?.registered ?? '–'}</Text><Text style={text.muted}>Registered</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{summary ? `${summary.checkInPercentage}%` : '–'}</Text><Text style={text.muted}>Attendance</Text></View>
      </Card>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['Scan', 'Attendees'] as Tab[]).map((item) => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'Scan'
        ? <Scanner eventId={event.id} onChanged={refreshSummary} />
        : <Attendees eventId={event.id} onChanged={refreshSummary} />}
    </View>
  )
}

function Scanner({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const [permission, requestPermission] = useCameraPermissions()
  const [result, setResult] = useState<Verification | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The camera reports the same code many times a second; this lock lets only the first one through.
  const locked = useRef(false)

  async function run(action: () => Promise<Verification>) {
    if (locked.current) return
    locked.current = true
    setError('')
    setBusy(true)
    try {
      const next = await action()
      setResult(next)
      Vibration.vibrate(next.result === 'CheckedIn' || next.result === 'Valid' ? 80 : [0, 120, 80, 120])
      if (next.result === 'CheckedIn') onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify this ticket.')
      locked.current = false
    } finally {
      setBusy(false)
    }
  }

  function next() {
    setResult(null)
    setError('')
    setCode('')
    locked.current = false
  }

  async function undo() {
    if (!result?.ticketId) return
    setBusy(true)
    setError('')
    try {
      await reverseCheckIn(result.ticketId)
      setResult({ ...result, result: 'Valid', ticketStatus: 'Valid', checkedInAt: null, message: 'Check-in reversed. The ticket can be used again.' })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reverse the check-in.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const outcome = outcomes[result.result]
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View accessibilityRole="alert" style={[styles.result, { backgroundColor: outcome.soft, borderColor: outcome.color }]}>
          <View style={[styles.resultBadge, { backgroundColor: outcome.color }]}><Text style={styles.resultSymbol}>{outcome.symbol}</Text></View>
          <Text style={[styles.resultTitle, { color: outcome.color }]}>{outcomeTitle(result)}</Text>
          <Text style={[text.body, styles.center]}>{result.message}</Text>
        </View>
        {result.attendeeName && (
          <Card style={styles.details}>
            <Text style={text.heading}>{result.attendeeName}</Text>
            <Text style={text.muted}>{result.attendeeEmail}</Text>
            <Text style={[text.body, styles.gap]}>{result.ticketTypeName}{result.seatLabel ? ` · ${result.seatLabel}` : ''}</Text>
            {result.checkedInAt && <Text style={text.muted}>Checked in {formatDateTime(result.checkedInAt)}</Text>}
          </Card>
        )}
        <ErrorText message={error} />
        {result.result === 'Valid' && <Button label="Record check-in" busy={busy} onPress={() => { locked.current = false; void run(() => checkIn(eventId, code.trim())) }} disabled={!code.trim()} />}
        {result.result === 'CheckedIn' && <Button label="Undo this check-in" variant="danger" busy={busy} onPress={() => void undo()} />}
        <Button label="Scan next ticket" variant={result.result === 'CheckedIn' ? 'primary' : 'secondary'} onPress={next} />
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {permission?.granted ? (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => { setCode(data); void run(() => checkIn(eventId, data)) }}
          />
          <View pointerEvents="none" style={styles.frame} />
          <Text style={styles.cameraHint}>{busy ? 'Checking…' : 'Point the camera at the ticket QR code'}</Text>
        </View>
      ) : (
        <Card style={styles.details}>
          <Text style={text.heading}>Camera access needed</Text>
          <Text style={[text.muted, styles.gap]}>BiletFlow uses the camera only to read ticket QR codes. You can also type the ticket code below.</Text>
          {permission && !permission.canAskAgain
            ? <Button label="Open settings" onPress={() => void Linking.openSettings()} />
            : <Button label="Allow camera" onPress={() => void requestPermission()} />}
        </Card>
      )}

      <ErrorText message={error} />

      <Card style={styles.details}>
        <Text style={text.label}>Ticket code</Text>
        <TextInput accessibilityLabel="Ticket code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="TKT_…" placeholderTextColor={colors.muted} style={text.input} />
        <View style={styles.row}>
          <Button label="Check in" style={styles.flex} busy={busy} disabled={!code.trim()} onPress={() => void run(() => checkIn(eventId, code.trim()))} />
          <Button label="Validate only" variant="secondary" style={styles.flex} disabled={busy || !code.trim()} onPress={() => void run(() => validateTicket(eventId, code.trim()))} />
        </View>
        <Text style={text.muted}>Campaign QR codes are discounts, not tickets, and are always rejected here.</Text>
      </Card>
    </ScrollView>
  )
}

function Attendees({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Attendee[] | null>(null)
  const [busyTicket, setBusyTicket] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      searchAttendees(eventId, search.trim())
        .then((value) => { if (active) setRows(value) })
        .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load attendees.') })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [eventId, search])

  async function undo(ticketId: string) {
    setError('')
    setBusyTicket(ticketId)
    try {
      await reverseCheckIn(ticketId)
      setRows((current) => current?.map((row) => row.ticketId === ticketId ? { ...row, status: 'Valid' } : row) ?? null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reverse the check-in.')
    } finally {
      setBusyTicket('')
    }
  }

  return (
    <View style={styles.flex}>
      <TextInput accessibilityLabel="Search attendees" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} placeholder="Search by name or email" placeholderTextColor={colors.muted} style={[text.input, styles.search]} />
      <ErrorText message={error} />
      <FlatList
        data={rows ?? []}
        keyExtractor={(row) => row.ticketId}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={[text.muted, styles.center, styles.gap]}>{rows ? 'No tickets match this search.' : 'Loading attendees…'}</Text>}
        renderItem={({ item }) => {
          const checkedIn = item.status === 'CheckedIn'
          const usable = item.status === 'Valid'
          return (
            <Card style={styles.attendee}>
              <View style={styles.flex}>
                <Text style={text.heading}>{item.attendeeName}</Text>
                <Text style={text.muted}>{item.attendeeEmail}</Text>
                <Text style={[text.body, styles.gap]}>{item.ticketTypeName}</Text>
                <Text style={[styles.status, { color: checkedIn ? colors.success : usable ? colors.ink : colors.danger }]}>
                  {checkedIn ? '✓ Checked in' : usable ? 'Not checked in yet' : `× ${item.status}`}
                </Text>
              </View>
              {checkedIn && <Button label="Undo" variant="danger" busy={busyTicket === item.ticketId} onPress={() => void undo(item.ticketId)} />}
            </Card>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, gap: 12 },
  flex: { flex: 1 },
  header: { paddingTop: 8, gap: 4 },
  back: { color: colors.brand, fontWeight: '700', fontSize: 15, marginBottom: 6 },
  summary: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: '800', color: colors.ink },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.brand },
  tabText: { fontWeight: '700', color: colors.muted, fontSize: 15 },
  tabTextActive: { color: '#ffffff' },
  content: { gap: 12, paddingBottom: 24 },
  camera: { height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 210, height: 210, borderRadius: 18, borderWidth: 3, borderColor: '#ffffff' },
  cameraHint: { position: 'absolute', bottom: 14, color: '#ffffff', fontWeight: '600', backgroundColor: 'rgba(15,23,42,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  details: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  gap: { marginTop: 4 },
  center: { textAlign: 'center' },
  result: { borderRadius: 18, borderWidth: 2, padding: 24, alignItems: 'center', gap: 10 },
  resultBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  resultSymbol: { color: '#ffffff', fontSize: 40, fontWeight: '800' },
  resultTitle: { fontSize: 28, fontWeight: '800' },
  search: { marginBottom: 12 },
  attendee: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { marginTop: 6, fontWeight: '700', fontSize: 14 },
})
