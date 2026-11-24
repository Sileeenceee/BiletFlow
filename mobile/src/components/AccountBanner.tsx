import { router } from 'expo-router'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useAuth } from '../lib/auth'
import { useLocale } from '../lib/i18n'
import { colors } from './ui'

/** Same reminder as the website's banner under the navigation bar. */
export function VerifyBanner() {
  const { user } = useAuth()
  const { t } = useLocale()
  if (!user || user.emailConfirmed) return null
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push('/account')} style={styles.banner}>
      <Text style={styles.text}>{t('nav.unverified')} <Text style={styles.link}>{t('nav.verifyNow')}</Text></Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12 },
  text: { color: colors.warning, fontSize: 14 },
  link: { fontWeight: '800', textDecorationLine: 'underline' },
})
