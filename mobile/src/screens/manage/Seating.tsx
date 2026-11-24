import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getTicketTypes, type TicketType } from '../../api/events'
import { configureSeating, getSeatMap, getVenues, type SeatMap as SeatMapData, type Venue } from '../../api/platform'
import { SeatMap } from '../../components/SeatMap'
import { Button, Card, Header, Notice, Segmented, Select, text } from '../../components/ui'
import { errorMessage } from '../../lib/format'
import { useLocale } from '../../lib/i18n'
import type { TabProps } from './types'

type Mode = 'General' | 'Assigned'

/**
 * General admission or assigned seating on the predefined venue layout (SRS 4.3.1).
 * Each venue section is priced by linking it to one ticket type; unlinked sections are not on sale.
 */
export function Seating({ event, onEvent, onError, onMessage }: TabProps) {
  const { t } = useLocale()
  const [venues, setVenues] = useState<Venue[]>([])
  const [types, setTypes] = useState<TicketType[]>([])
  const [map, setMap] = useState<SeatMapData | null>(null)
  const [mode, setMode] = useState<Mode>('General')
  const [venueId, setVenueId] = useState('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getVenues(), getTicketTypes(event.id), getSeatMap(event.id)])
      .then(([venueRows, typeRows, seatMap]) => {
        if (!active) return
        setVenues(venueRows)
        setTypes(typeRows)
        setMap(seatMap)
        setMode(seatMap.seatingMode)
        setVenueId(seatMap.venueId ?? venueRows[0]?.id ?? '')
        setLinks(Object.fromEntries(seatMap.sections.filter((section) => section.ticketTypeId).map((section) => [section.sectionId, section.ticketTypeId!])))
      })
      .catch((err: unknown) => { if (active) onError(errorMessage(err, t('seating.loadError'))) })
    return () => { active = false }
  }, [event.id, onError, t])

  const venue = venues.find((item) => item.id === venueId)

  async function save() {
    onError('')
    onMessage('')
    setBusy(true)
    try {
      const sections = mode === 'Assigned' && venue
        ? venue.sections.filter((section) => links[section.id]).map((section) => ({ sectionId: section.id, ticketTypeId: links[section.id] }))
        : []
      const saved = await configureSeating(event.id, { seatingMode: mode, venueId: mode === 'Assigned' ? venueId : null, sections })
      setMap(saved)
      onEvent({ ...event, seatingMode: saved.seatingMode })
      onMessage(mode === 'Assigned' ? t('seating.savedAssigned') : t('seating.savedGeneral'))
    } catch (err) {
      onError(errorMessage(err, t('seating.saveError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.gap}>
      <Header title={t('seating.title')} subtitle={t('seating.text')} />
      <Card style={styles.gap}>
        <Text style={text.label}>{t('seating.mode')}</Text>
        <Segmented label={t('seating.mode')} value={mode} onChange={setMode} items={[{ value: 'General', label: t('seating.general') }, { value: 'Assigned', label: t('seating.assigned') }]} />
        {mode === 'Assigned' && (
          <>
            <Select label={t('seating.layout')} value={venueId} onChange={setVenueId} options={venues.map((item) => ({ value: item.id, label: t('seating.venueOption', { name: item.name, count: item.seatCount }) }))} />
            {venue ? <Text style={text.muted}>{venue.address}</Text> : null}
            {types.length === 0 && <Notice tone="warning" message={t('seating.needTypes')} />}
            {venue?.sections.map((section) => (
              <View key={`${venueId}-${section.id}`} style={styles.section}>
                <Select
                  label={section.name}
                  value={links[section.id] ?? ''}
                  onChange={(value) => setLinks((current) => ({ ...current, [section.id]: value }))}
                  options={[{ value: '', label: t('seatMap.notOnSale') }, ...types.map((type) => ({ value: type.id, label: type.name }))]}
                />
                <Text style={text.muted}>{t('seating.sectionInfo', { seats: section.seatCount, accessible: section.accessibleSeatCount, rows: section.rows.join(', ') })}</Text>
              </View>
            ))}
          </>
        )}
        <Button label={busy ? t('common.saving') : t('seating.save')} busy={busy} onPress={() => void save()} />
      </Card>
      <Card style={styles.gap}>
        <Text style={text.heading}>{t('seating.previewTitle')}</Text>
        {map?.seatingMode === 'Assigned'
          ? <SeatMap map={map} selected={[]} limit={0} onToggle={() => undefined} />
          : <Text style={text.muted}>{t('seating.generalNote')}</Text>}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  section: { gap: 4 },
})
