import { CameraView, useCameraPermissions } from 'expo-camera'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Linking, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native'
import { checkInTicket, validateTicket, type Verification } from '../../api/checkin'
import { getCheckInSummary, reverseCheckIn, searchEventAttendees, type CheckInSummary } from '../../api/workflows'
import { Button, Card, ErrorText, Page, Segmented, colors, text } from '../../components/ui'
import { errorMessage, formatDateTime } from '../../lib/format'
import { enumLabel, useLocale, type TranslationKey } from '../../lib/i18n'

type Tab = 'scan' | 'attendees'
type Attendee = Awaited<ReturnType<typeof searchEventAttendees>>[number]

// Each outcome has its own colour, symbol and wording, so it is clear at a glance and without colour (SRS 4.8).
const outcomes: Record<Verification['result'], { title: TranslationKey; symbol: string; color: string; soft: string }> = {
  CheckedIn: { title: 'mobile.admitted', symbol: '✓', color: colors.success, soft: colors.successSoft },
  Valid: { title: 'mobile.validTicket', symbol: '✓', color: colors.success, soft: colors.successSoft },
  AlreadyUsed: { title: 'mobile.alreadyUsed', symbol: '!', color: colors.warning, soft: colors.warningSoft },
  Invalid: { title: 'mobile.notValid', symbol: '×', color: colors.danger, soft: colors.dangerSoft },
}

/** Says why a ticket was rejected in one or two words: Cancelled, Refunded or Not valid. */
function outcomeTitle(result: Verification): TranslationKey {
  if (result.result === 'Invalid' && (result.ticketStatus === 'Cancelled' || result.ticketStatus === 'Refunded')) {
    return `mobile.ticketStatus.${result.ticketStatus}`
  }
  return outcomes[result.result].title
}

/** Online ticket verification for one assigned event: scanner, result screen, undo and attendee search. */
export default function CheckinEvent() {
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title?: string }>()
  const { t } = useLocale()
  const [tab, setTab] = useState<Tab>('scan')
  const [summary, setSummary] = useState<CheckInSummary | null>(null)

  const refreshSummary = useCallback(() => {
    getCheckInSummary(eventId).then(setSummary).catch(() => undefined)
  }, [eventId])

  // Other scanners at the same event change the totals, so they are re-read every 15 seconds.
  useEffect(() => {
    refreshSummary()
    const timer = setInterval(refreshSummary, 15_000)
    return () => clearInterval(timer)
  }, [refreshSummary])

  return (
    <Page>
      <Stack.Screen options={{ title: title || t('nav.checkin') }} />
      <View style={styles.top}>
        <Card style={styles.summary}>
          <SummaryItem value={summary?.checkedIn} label={t('mobile.checkedIn')} />
          <SummaryItem value={summary?.registered} label={t('checkin.registered')} />
          <SummaryItem value={summary ? `${summary.checkInPercentage}%` : undefined} label={t('mobile.attendance')} />
        </Card>
        <Segmented value={tab} onChange={setTab} items={[{ value: 'scan', label: t('mobile.scanTab') }, { value: 'attendees', label: t('mobile.attendeesTab') }]} />
      </View>
      {tab === 'scan'
        ? <Scanner eventId={eventId} onChanged={refreshSummary} />
        : <Attendees eventId={eventId} onChanged={refreshSummary} />}
    </Page>
  )
}

function SummaryItem({ value, label }: { value: number | string | undefined; label: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value ?? '–'}</Text>
      <Text style={text.muted}>{label}</Text>
    </View>
  )
}

function Scanner({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { t } = useLocale()
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
      setError(errorMessage(err, t('checkin.checkInError')))
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
      setResult({ ...result, result: 'Valid', ticketStatus: 'Valid', checkedInAt: null, message: t('checkin.reversed') })
      onChanged()
    } catch (err) {
      setError(errorMessage(err, t('checkin.reverseError')))
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
          <Text style={[styles.resultTitle, { color: outcome.color }]}>{t(outcomeTitle(result))}</Text>
          <Text style={[text.body, styles.center]}>{result.message}</Text>
        </View>
        {result.attendeeName && (
          <Card>
            <Text style={text.heading}>{result.attendeeName}</Text>
            <Text style={text.muted}>{result.attendeeEmail}</Text>
            <Text style={text.body}>{result.ticketTypeName}{result.seatLabel ? ` · ${result.seatLabel}` : ''}</Text>
            {result.checkedInAt && <Text style={text.muted}>{t('mobile.checkedInAt', { time: formatDateTime(result.checkedInAt) })}</Text>}
          </Card>
        )}
        <ErrorText message={error} />
        {result.result === 'Valid' && <Button label={t('checkin.record')} busy={busy} disabled={!code.trim()} onPress={() => { locked.current = false; void run(() => checkInTicket(eventId, code.trim())) }} />}
        {/* An already-used ticket can also be undone, e.g. after an accidental scan (SRS 4.8). */}
        {(result.result === 'CheckedIn' || result.result === 'AlreadyUsed') && result.ticketId && <Button label={t('mobile.undo')} variant="danger" busy={busy} onPress={() => void undo()} />}
        <Button label={t('mobile.scanNext')} variant={result.result === 'CheckedIn' ? 'primary' : 'secondary'} onPress={next} />
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
            onBarcodeScanned={({ data }) => { setCode(data); void run(() => checkInTicket(eventId, data)) }}
          />
          <View pointerEvents="none" style={styles.frame} />
          <Text style={styles.cameraHint}>{busy ? t('checkin.checking') : t('mobile.pointCamera')}</Text>
        </View>
      ) : (
        <Card>
          <Text style={text.heading}>{t('mobile.cameraNeeded')}</Text>
          <Text style={text.muted}>{t('mobile.cameraNeededText')}</Text>
          {permission && !permission.canAskAgain
            ? <Button label={t('mobile.openSettings')} onPress={() => void Linking.openSettings()} />
            : <Button label={t('mobile.allowCamera')} onPress={() => void requestPermission()} />}
        </Card>
      )}

      <ErrorText message={error} />

      <Card>
        <Text style={text.label}>{t('checkin.codeLabel')}</Text>
        <TextInput accessibilityLabel={t('checkin.codeLabel')} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="TKT_…" placeholderTextColor={colors.muted} style={text.input} />
        <View style={styles.row}>
          <Button label={t('mobile.checkIn')} style={styles.flex} busy={busy} disabled={!code.trim()} onPress={() => void run(() => checkInTicket(eventId, code.trim()))} />
          <Button label={t('mobile.validateOnly')} variant="secondary" style={styles.flex} disabled={busy || !code.trim()} onPress={() => void run(() => validateTicket(eventId, code.trim()))} />
        </View>
        <Text style={text.muted}>{t('mobile.campaignNotTicket')}</Text>
      </Card>
    </ScrollView>
  )
}

function Attendees({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { t } = useLocale()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Attendee[] | null>(null)
  const [busyTicket, setBusyTicket] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      searchEventAttendees(eventId, search.trim())
        .then((value) => { if (active) setRows(value) })
        .catch((err: unknown) => { if (active) setError(errorMessage(err, t('checkin.detailsError'))) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [eventId, search, t])

  async function undo(ticketId: string) {
    setError('')
    setBusyTicket(ticketId)
    try {
      await reverseCheckIn(ticketId)
      setRows((current) => current?.map((row) => row.ticketId === ticketId ? { ...row, status: 'Valid' } : row) ?? null)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, t('checkin.reverseError')))
    } finally {
      setBusyTicket('')
    }
  }

  return (
    <View style={styles.flex}>
      <TextInput accessibilityLabel={t('checkin.searchLabel')} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} placeholder={t('checkin.searchPlaceholder')} placeholderTextColor={colors.muted} style={[text.input, styles.search]} />
      <ErrorText message={error} />
      <FlatList
        data={rows ?? []}
        keyExtractor={(row) => row.ticketId}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={[text.muted, styles.center]}>{rows ? t('checkin.noMatch') : t('checkin.loading')}</Text>}
        renderItem={({ item }) => {
          const checkedIn = item.status === 'CheckedIn'
          const usable = item.status === 'Valid'
          return (
            <Card style={styles.attendee}>
              <View style={styles.flex}>
                <Text style={text.heading}>{item.attendeeName}</Text>
                <Text style={text.muted}>{item.attendeeEmail}</Text>
                <Text style={text.body}>{item.ticketTypeName}</Text>
                <Text style={[styles.status, { color: checkedIn ? colors.success : usable ? colors.ink : colors.danger }]}>
                  {checkedIn ? `✓ ${t('mobile.checkedIn')}` : usable ? t('mobile.notCheckedIn') : `× ${enumLabel(t, `orders.ticketStatus.${item.status}`, item.status)}`}
                </Text>
              </View>
              {checkedIn && <Button small label={t('checkin.reverse')} variant="danger" busy={busyTicket === item.ticketId} onPress={() => void undo(item.ticketId)} />}
            </Card>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { padding: 16, paddingBottom: 0, gap: 12 },
  summary: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: '800', color: colors.ink },
  content: { gap: 12, padding: 16, paddingBottom: 32 },
  camera: { height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 210, height: 210, borderRadius: 18, borderWidth: 3, borderColor: '#ffffff' },
  cameraHint: { position: 'absolute', bottom: 14, color: '#ffffff', fontWeight: '600', backgroundColor: 'rgba(15,23,42,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 10 },
  center: { textAlign: 'center' },
  result: { borderRadius: 18, borderWidth: 2, padding: 24, alignItems: 'center', gap: 10 },
  resultBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  resultSymbol: { color: '#ffffff', fontSize: 40, fontWeight: '800' },
  resultTitle: { fontSize: 28, fontWeight: '800' },
  search: { marginHorizontal: 16, marginTop: 12 },
  attendee: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { marginTop: 4, fontWeight: '700', fontSize: 14 },
})
