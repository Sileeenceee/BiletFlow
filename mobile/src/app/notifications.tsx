import { router, type Href } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { markAllNotificationsRead } from '../api/platform'
import { getNotifications, markNotificationRead } from '../api/workflows'
import { Button, Card, Empty, ErrorText, Header, Loading, Screen, text } from '../components/ui'
import { errorMessage, formatDateTime, humanize } from '../lib/format'
import { isMessageKey, useLocale } from '../lib/i18n'

type Notification = Awaited<ReturnType<typeof getNotifications>>[number]

/** Where a notification leads: its support case, the ticket list, or the event page. */
function target(item: Notification): Href | null {
  if (item.relatedCaseId) return { pathname: '/support', params: { caseId: item.relatedCaseId } }
  if (item.relatedOrderId) return '/tickets'
  if (item.relatedEventId) return `/events/${item.relatedEventId}`
  return null
}

/** In-app notification centre (SRS 4.10); the same events are also sent by email. */
export default function Notifications() {
  const { t } = useLocale()
  const [items, setItems] = useState<Notification[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setItems(await getNotifications())
    } catch (err) {
      setError(errorMessage(err, t('notifications.loadError')))
      setItems((current) => current ?? [])
    }
  }, [t])

  useEffect(() => {
    let active = true
    getNotifications()
      .then((rows) => { if (active) setItems(rows) })
      .catch((err: unknown) => { if (active) { setError(errorMessage(err, t('notifications.loadError'))); setItems([]) } })
    return () => { active = false }
  }, [t])

  async function read(item: Notification) {
    if (item.readAt) return
    try {
      await markNotificationRead(item.id)
      setItems((current) => current?.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row) ?? null)
    } catch (err) {
      setError(errorMessage(err, t('notifications.readError')))
    }
  }

  async function readAll() {
    try {
      await markAllNotificationsRead()
      await load()
    } catch (err) {
      setError(errorMessage(err, t('notifications.readAllError')))
    }
  }

  if (!items) return <Loading label={t('notifications.loading')} />
  const unread = items.filter((item) => !item.readAt).length
  const typeLabel = (type: string) => {
    const key = `notifications.type.${type}`
    return isMessageKey(key) ? t(key) : humanize(type)
  }

  return (
    <Screen onRefresh={() => void load()}>
      <Header kicker={t('notifications.kicker')} title={t('nav.notifications')} subtitle={t('notifications.unread', { count: unread })} />
      {unread > 0 && <Button label={t('notifications.markAll')} variant="secondary" onPress={() => void readAll()} />}
      <ErrorText message={error} />
      {items.length === 0 ? <Empty title={t('notifications.empty')} /> : items.map((item) => {
        const link = target(item)
        return (
          <Card key={item.id} style={!item.readAt && styles.unread}>
            <View style={styles.head}>
              <Text style={[text.kicker, styles.flex]}>{typeLabel(item.type).toUpperCase()}</Text>
              <Text style={text.muted}>{formatDateTime(item.createdAt)}</Text>
            </View>
            <Text style={text.subheading}>{item.title}</Text>
            <Text style={text.body}>{item.message}</Text>
            <View style={styles.actions}>
              {link && <Button small label={t('notifications.open')} onPress={() => { void read(item); router.push(link) }} />}
              {!item.readAt && <Button small variant="ghost" label={t('notifications.markRead')} onPress={() => void read(item)} />}
            </View>
          </Card>
        )
      })}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  unread: { borderColor: '#bfd0f7', backgroundColor: '#f5f8ff' },
  head: { flexDirection: 'row', gap: 8 },
  actions: { flexDirection: 'row', gap: 8 },
})
