import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { getAssignedEvents, type AssignedEvent, type Session } from '../api'
import { Button, Card, colors, ErrorText, formatDateTime, text } from '../ui'

type Props = {
  session: Session
  onOpen: (event: AssignedEvent) => void
  onSignOut: () => void
}

/** Lists only the events this administrator is assigned to (SRS 4.8). */
export function EventsScreen({ session, onOpen, onSignOut }: Props) {
  const [events, setEvents] = useState<AssignedEvent[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setEvents(await getAssignedEvents())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your events.')
      setEvents((current) => current ?? [])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={text.kicker}>Event staff</Text>
          <Text style={text.title}>Your events</Text>
          <Text style={text.muted} numberOfLines={1}>{session.email}</Text>
        </View>
        <Button label="Sign out" variant="secondary" onPress={onSignOut} />
      </View>
      <ErrorText message={error} />
      <FlatList
        data={events ?? []}
        keyExtractor={(event) => event.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListEmptyComponent={
          <Card>
            <Text style={text.heading}>{events ? 'No assigned events' : 'Loading events…'}</Text>
            {events && <Text style={[text.muted, styles.empty]}>Ask the organizer to assign this account under the event's Team tab, then pull down to refresh.</Text>}
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => onOpen(item)} style={({ pressed }) => pressed && styles.pressed}>
            <Card>
              <Text style={text.heading}>{item.title}</Text>
              <Text style={[text.body, styles.when]}>{formatDateTime(item.startDateUtc)}</Text>
              <Text style={text.muted}>{[item.venue, item.city].filter(Boolean).join(', ')}</Text>
              <Text style={styles.open}>Open check-in →</Text>
            </Card>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, gap: 12 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 8 },
  list: { gap: 12, paddingBottom: 24 },
  empty: { marginTop: 6, fontSize: 14 },
  when: { marginTop: 6, fontWeight: '600' },
  open: { marginTop: 12, color: colors.brand, fontWeight: '700' },
  pressed: { opacity: 0.7 },
})
