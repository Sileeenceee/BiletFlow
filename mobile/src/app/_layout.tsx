import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Loading, colors } from '../components/ui'
import { AuthProvider } from '../lib/auth'
import { LocaleProvider, useLocale } from '../lib/i18n'
import { loadStoredState } from '../lib/storage'

export default function RootLayout() {
  // Session, server address and language live in secure storage, which is asynchronous.
  const [ready, setReady] = useState(false)
  useEffect(() => { void loadStoredState().finally(() => setReady(true)) }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ready ? (
        <LocaleProvider>
          <AuthProvider>
            <Routes />
          </AuthProvider>
        </LocaleProvider>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><Loading /></View>
      )}
    </SafeAreaProvider>
  )
}

function Routes() {
  const { t } = useLocale()
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brand,
        headerTitleStyle: { color: colors.ink, fontWeight: '700' },
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: t('nav.logIn') }} />
      <Stack.Screen name="register" options={{ title: t('nav.signUp') }} />
      <Stack.Screen name="verify-email" options={{ title: t('auth.inboxTitle') }} />
      <Stack.Screen name="forgot-password" options={{ title: t('auth.forgotTitle') }} />
      <Stack.Screen name="reset-password" options={{ title: t('auth.resetTitle') }} />
      <Stack.Screen name="events/[id]/index" options={{ title: t('nav.events') }} />
      <Stack.Screen name="events/[id]/manage" options={{ title: t('events.manage') }} />
      <Stack.Screen name="events/new" options={{ title: t('nav.create') }} />
      <Stack.Screen name="orders/[id]" options={{ title: t('mobile.ticketsTitle') }} />
      <Stack.Screen name="checkin/[eventId]" options={{ title: t('nav.checkin') }} />
      <Stack.Screen name="campaign/[token]" options={{ title: t('campaign.kicker') }} />
      <Stack.Screen name="support" options={{ title: t('nav.support') }} />
      <Stack.Screen name="notifications" options={{ title: t('nav.notifications') }} />
      <Stack.Screen name="account" options={{ title: t('nav.account') }} />
      <Stack.Screen name="organizer-profile" options={{ title: t('nav.profile') }} />
    </Stack>
  )
}
