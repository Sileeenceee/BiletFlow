import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { getServer, signIn, type Session } from '../api'
import { Button, Card, colors, ErrorText, text } from '../ui'

export function LoginScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [server, setServer] = useState(getServer())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    setBusy(true)
    try {
      onSignedIn(await signIn(server, email.trim(), password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Text style={styles.logoText}>B</Text></View>
        <Text style={text.title}>BiletFlow Check-in</Text>
        <Text style={[text.muted, styles.subtitle]}>Sign in with the event administrator account the organizer assigned to an event.</Text>

        <Card style={styles.form}>
          <View>
            <Text style={text.label}>Email</Text>
            <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" style={text.input} />
          </View>
          <View>
            <Text style={text.label}>Password</Text>
            <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={() => void submit()} style={text.input} />
          </View>
          <View>
            <Text style={text.label}>Server address</Text>
            <TextInput accessibilityLabel="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={text.input} />
            <Text style={[text.muted, styles.hint]}>The BiletFlow site as reachable from this phone, for example http://192.168.1.20:8080.</Text>
          </View>
          <ErrorText message={error} />
          <Button label="Sign in" onPress={() => void submit()} busy={busy} disabled={!email.trim() || !password || !server.trim()} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  subtitle: { marginTop: 6, marginBottom: 20, fontSize: 15 },
  form: { gap: 16 },
  hint: { marginTop: 6 },
})
