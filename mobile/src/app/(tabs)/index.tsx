import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { cancelEvent, duplicateEvent, getEvents, type EventSummary } from '../../api/events'
import { VerifyBanner } from '../../components/AccountBanner'
import { Badge, Button, Card, Empty, ErrorText, Header, Loading, Screen, Select, colors, text } from '../../components/ui'
import { isOrganizerRole, useAuth } from '../../lib/auth'
import { confirmAction } from '../../lib/confirm'
import { errorMessage, formatDateTime } from '../../lib/format'
import { useLocale } from '../../lib/i18n'

/** Public event list; organizers see their own portfolio with management actions, like the website. */
export default function Explore() {
  const { user } = useAuth()
  const { t } = useLocale()
  const role = user?.role
  const isOrganizer = isOrganizerRole(role)
  const [events, setEvents] = useState<EventSummary[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setEvents(await getEvents(role === 'Organizer'))
    } catch (err) {
      setError(errorMessage(err, t('events.loadError')))
      setEvents((current) => current ?? [])
    }
  }, [role, t])

  // Reload when the tab regains focus, e.g. after creating or editing an event.
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const cities = useMemo(() => [...new Set((events ?? []).map((event) => event.city).filter(Boolean))].sort(), [events])
  const visible = useMemo(() => (events ?? []).filter((event) => {
    const matches = `${event.title} ${event.description} ${event.category ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    return matches && (!city || event.city.toLocaleLowerCase() === city.toLocaleLowerCase())
  }), [city, events, query])

  async function duplicate(eventId: string) {
    setError('')
    try {
      const copy = await duplicateEvent(eventId)
      setEvents((current) => [copy, ...(current ?? [])])
    } catch (err) {
      setError(errorMessage(err, t('events.duplicateError')))
    }
  }

  function confirmCancel(event: EventSummary) {
    confirmAction(t('events.confirmCancel'), t('events.confirmCancelText'), t('events.cancel'), t('events.keep'), () => {
      cancelEvent(event.id)
        .then((cancelled) => setEvents((current) => current?.map((item) => item.id === cancelled.id ? cancelled : item) ?? null))
        .catch((err: unknown) => setError(errorMessage(err, t('events.cancelError'))))
    })
  }

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
      <VerifyBanner />
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>{isOrganizer ? t('events.organizerKicker') : t('events.heroKicker')}</Text>
        <Text style={styles.heroTitle}>{isOrganizer ? t('events.heroOrganizerTitle') : t('events.heroTitle')}</Text>
        <Text style={styles.heroText}>{isOrganizer ? t('events.heroOrganizerText') : t('events.heroText')}</Text>
        {isOrganizer && <Button label={t('events.create')} variant="secondary" style={styles.heroButton} onPress={() => router.push('/events/new')} />}
        {!user && <Button label={t('nav.logIn')} variant="secondary" style={styles.heroButton} onPress={() => router.push('/login')} />}
      </View>

      <Header kicker={isOrganizer ? t('events.organizerKicker') : t('events.kicker')} title={isOrganizer ? t('events.organizerHeading') : t('events.heading')} />
      <TextInput accessibilityLabel={t('events.search')} value={query} onChangeText={setQuery} placeholder={t('events.searchPlaceholder')} placeholderTextColor={colors.muted} style={text.input} />
      {cities.length > 1 && (
        <Select label={t('events.cityFilter')} value={city} onChange={setCity} options={[{ value: '', label: t('events.allCities') }, ...cities.map((name) => ({ value: name, label: name }))]} />
      )}
      <ErrorText message={error} />

      {!events ? <Loading label={t('events.loading')} />
        : events.length === 0 ? (error ? null : <Empty title={isOrganizer ? t('events.emptyOrganizerTitle') : t('events.emptyTitle')} text={isOrganizer ? t('events.emptyOrganizerText') : t('events.emptyText')} />)
        : visible.length === 0 ? <Empty title={t('events.noMatch')} />
        : visible.map((event) => (
          <Card key={event.id} style={styles.card}>
            <Pressable accessibilityRole="link" accessibilityLabel={event.title} onPress={() => router.push(`/events/${event.id}`)}>
              {event.imageUrls?.[0]
                ? <Image source={{ uri: event.imageUrls[0] }} style={styles.image} accessibilityIgnoresInvertColors />
                : <View style={[styles.image, styles.placeholder]}><Text style={styles.placeholderMark}>✦</Text></View>}
              <View style={styles.cardBody}>
                {isOrganizer && (
                  <Badge
                    label={event.isCancelled ? t('events.cancelled') : event.isPublished ? t('events.published') : t('events.draft')}
                    tone={event.isCancelled ? 'danger' : event.isPublished ? 'success' : 'warning'}
                  />
                )}
                <Text style={text.kicker}>{(event.category || event.city).toUpperCase()}</Text>
                <Text style={text.heading}>{event.title}</Text>
                <Text style={text.muted} numberOfLines={2}>{event.description}</Text>
                <Text style={[text.body, styles.when]}>{formatDateTime(event.startDateUtc)}</Text>
                <Text style={text.muted}>{event.venue}{event.city ? ` · ${event.city}` : ''}</Text>
              </View>
            </Pressable>
            {isOrganizer && (
              <View style={styles.actions}>
                {!event.isCancelled && <Button small label={t('events.manage')} onPress={() => router.push(`/events/${event.id}/manage`)} />}
                <Button small variant="secondary" label={t('events.copy')} onPress={() => void duplicate(event.id)} />
                {!event.isCancelled && <Button small variant="danger" label={t('events.cancel')} onPress={() => confirmCancel(event)} />}
              </View>
            )}
          </Card>
        ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brandDark, borderRadius: 20, padding: 20, gap: 8 },
  heroKicker: { color: '#c7d6fb', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  heroTitle: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  heroText: { color: '#e2e8ff', fontSize: 15, lineHeight: 22 },
  heroButton: { alignSelf: 'flex-start', marginTop: 6 },
  card: { padding: 0, overflow: 'hidden', gap: 0 },
  image: { height: 140, width: '100%' },
  placeholder: { backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  placeholderMark: { fontSize: 40, color: '#a5b8ef' },
  cardBody: { padding: 16, gap: 6 },
  when: { fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
})
