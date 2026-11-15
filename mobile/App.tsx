import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native'
import { loadStoredState, setSignedOutHandler, signOut, type AssignedEvent, type Session } from './src/api'
import { EventScreen } from './src/screens/EventScreen'
import { EventsScreen } from './src/screens/EventsScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { colors } from './src/ui'

/**
 * BiletFlow Check-in: the ticket-verification app for Event Admins (SRS 4.8).
 * Three screens — sign in, assigned events, check-in — so plain state is enough for navigation.
 */
export default function App() {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [event, setEvent] = useState<AssignedEvent | null>(null)

  useEffect(() => {
    // Fired when the server rejects the stored session (expired or revoked refresh token).
    setSignedOutHandler(() => { setSession(null); setEvent(null) })
    loadStoredState().then(setSession).finally(() => setReady(true))
  }, [])

  async function leave() {
    await signOut()
    setSession(null)
    setEvent(null)
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.body}>
        {!ready ? <ActivityIndicator style={styles.loading} color={colors.brand} size="large" />
          : !session ? <LoginScreen onSignedIn={setSession} />
          : event ? <EventScreen event={event} onBack={() => setEvent(null)} />
          : <EventsScreen session={session} onOpen={setEvent} onSignOut={() => void leave()} />}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // Android draws under the status bar, so the content starts below it.
  body: { flex: 1, paddingTop: 36 },
  loading: { flex: 1 },
})
