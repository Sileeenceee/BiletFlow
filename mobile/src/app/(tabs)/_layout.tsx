import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'
import { useEffect, useState } from 'react'
import type { ColorValue } from 'react-native'
import { getNotifications } from '../../api/workflows'
import { colors } from '../../components/ui'
import { isOrganizerRole, useAuth } from '../../lib/auth'
import { useLocale } from '../../lib/i18n'

type IconName = keyof typeof Ionicons.glyphMap

const icon = (name: IconName) => function TabBarIcon({ color, size }: { color: ColorValue; size: number }) {
  return <Ionicons name={name} color={color as string} size={size} />
}

/** Bottom tabs follow the role, like the website's navigation bar. */
export default function TabsLayout() {
  const { user } = useAuth()
  const { t } = useLocale()
  const [unread, setUnread] = useState(0)
  const role = user?.role

  // No push channel exists (SRS 4.13), so the unread count is polled once a minute.
  useEffect(() => {
    if (!user) return
    let active = true
    const load = () => getNotifications()
      .then((items) => { if (active) setUnread(items.filter((item) => !item.readAt).length) })
      .catch(() => undefined)
    void load()
    const timer = setInterval(() => void load(), 60_000)
    return () => { active = false; clearInterval(timer) }
  }, [user])

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { color: colors.ink, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.explore'), tabBarIcon: icon('compass-outline') }} />
      <Tabs.Screen name="tickets" options={{ title: t('nav.tickets'), tabBarIcon: icon('ticket-outline'), href: role === 'Attendee' ? undefined : null }} />
      <Tabs.Screen name="dashboard" options={{ title: t('nav.dashboard'), tabBarIcon: icon('stats-chart-outline'), href: isOrganizerRole(role) ? undefined : null }} />
      <Tabs.Screen name="checkin" options={{ title: t('nav.checkin'), tabBarIcon: icon('qr-code-outline'), href: role === 'EventAdmin' ? undefined : null }} />
      <Tabs.Screen name="admin" options={{ title: t('nav.admin'), tabBarIcon: icon('shield-checkmark-outline'), href: role === 'PlatformAdmin' ? undefined : null }} />
      <Tabs.Screen name="more" options={{ title: t('mobile.more'), tabBarIcon: icon('menu-outline'), tabBarBadge: unread > 0 ? unread : undefined }} />
    </Tabs>
  )
}
