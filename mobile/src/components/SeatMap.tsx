import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Seat, SeatMap as SeatMapData } from '../api/platform'
import { formatKzt } from '../lib/format'
import { useLocale } from '../lib/i18n'
import { colors, text } from './ui'

type SeatState = Seat['status'] | 'Selected'

// Each state pairs a colour with a symbol so the map never relies on colour alone (SRS 4.3.1).
const palette: Record<SeatState, { fill: string; stroke: string; text: string; symbol: string }> = {
  Available: { fill: '#ffffff', stroke: '#059669', text: '#047857', symbol: '' },
  Selected: { fill: colors.brand, stroke: colors.brandDark, text: '#ffffff', symbol: '✓' },
  Held: { fill: '#fef3c7', stroke: '#d97706', text: '#92400e', symbol: 'H' },
  Sold: { fill: '#cbd5e1', stroke: '#64748b', text: '#334155', symbol: '×' },
  Unavailable: { fill: '#f1f5f9', stroke: '#cbd5e1', text: '#94a3b8', symbol: '–' },
}

const states: SeatState[] = ['Available', 'Selected', 'Held', 'Sold', 'Unavailable']

type Props = {
  map: SeatMapData
  selected: string[]
  /** Maximum number of seats in one order; 0 makes the map read-only. */
  limit: number
  onToggle: (seat: Seat) => void
}

export function SeatMap({ map, selected, limit, onToggle }: Props) {
  const { t } = useLocale()
  return (
    <View style={styles.map}>
      <View accessibilityLabel={t('seatMap.legendLabel')} style={styles.legend}>
        {states.map((state) => (
          <View key={state} style={styles.legendItem}>
            <SeatBox state={state} label="" accessible={false} />
            <Text style={[text.muted, styles.legendText]}>{t(`seatMap.legend.${state}`)}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <SeatBox state="Available" label="♿" accessible />
          <Text style={[text.muted, styles.legendText]}>{t('seatMap.accessibleSeat')}</Text>
        </View>
      </View>

      {map.sections.map((section) => {
        const rows = [...new Set(section.seats.map((seat) => seat.rowLabel))]
        return (
          <View key={section.sectionId} accessibilityLabel={t('seatMap.section', { name: section.name })} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={text.subheading}>{section.name}</Text>
              <Text style={text.muted}>
                {section.ticketTypeName ? `${section.ticketTypeName} · ${section.price ? formatKzt(section.price) : t('event.free')}` : t('seatMap.notOnSale')}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.grid}>
              <View style={styles.gridInner}>
                {rows.map((row) => (
                  <View key={row} style={styles.row}>
                    <Text style={styles.rowLabel}>{row}</Text>
                    {section.seats.filter((seat) => seat.rowLabel === row).map((seat) => {
                      const isSelected = selected.includes(seat.seatId)
                      const state: SeatState = isSelected ? 'Selected' : seat.status
                      const selectable = limit > 0 && (isSelected || (seat.status === 'Available' && selected.length < limit))
                      const name = t('seatMap.seat', { section: section.name, row: seat.rowLabel, seat: seat.number })
                      return (
                        <Pressable
                          key={seat.seatId}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected, disabled: !selectable }}
                          accessibilityLabel={`${name}${seat.isAccessible ? `, ${t('seatMap.accessible')}` : ''}, ${t(`seatMap.state.${state}`)}`}
                          disabled={!selectable}
                          onPress={() => onToggle(seat)}
                          hitSlop={2}
                        >
                          <SeatBox state={state} label={seat.number} accessible={seat.isAccessible} />
                        </Pressable>
                      )
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )
      })}
    </View>
  )
}

function SeatBox({ state, label, accessible }: { state: SeatState; label: string; accessible: boolean }) {
  const style = palette[state]
  return (
    <View style={[styles.seat, { backgroundColor: style.fill, borderColor: style.stroke }, accessible && styles.accessible]}>
      <Text style={[styles.seatText, { color: style.text }]}>{style.symbol || (accessible ? '♿' : label)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  map: { gap: 14 },
  legend: { gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { flex: 1 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  grid: { padding: 8, backgroundColor: colors.background, borderRadius: 12 },
  gridInner: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { width: 22, color: colors.muted, fontWeight: '700', fontSize: 12, textAlign: 'right', marginRight: 4 },
  seat: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  accessible: { borderWidth: 2.5, borderStyle: 'dashed' },
  seatText: { fontSize: 11, fontWeight: '800' },
})
