import Ionicons from '@expo/vector-icons/Ionicons'
import Constants from 'expo-constants'
import { router, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { VerifyBanner } from '../../components/AccountBanner'
import { Button, Card, Header, Screen, Select, colors, text } from '../../components/ui'
import { isOrganizerRole, useAuth } from '../../lib/auth'
import { locales, useLocale, type Locale, type TranslationKey } from '../../lib/i18n'
import { getServer } from '../../lib/storage'

type Item = { href: Href; label: TranslationKey; icon: keyof typeof Ionicons.glyphMap }

/** Account, language and the pages the website keeps in its navigation bar. */
export default function More() {
  const { user, signOut } = useAuth()
  const { t, locale, setLocale } = useLocale()

  const items: Item[] = []
  if (user) {
    items.push({ href: '/notifications', label: 'nav.notifications', icon: 'notifications-outline' })
    items.push({ href: '/support', label: 'nav.support', icon: 'chatbubbles-outline' })
    if (isOrganizerRole(user.role)) {
      items.push({ href: '/events/new', label: 'nav.create', icon: 'add-circle-outline' })
      items.push({ href: '/organizer-profile', label: 'nav.profile', icon: 'briefcase-outline' })
    }
    items.push({ href: '/account', label: 'nav.account', icon: 'person-circle-outline' })
  }

  return (
    <Screen>
      <VerifyBanner />
      {user ? (
        <Card>
          <Text style={text.heading}>{user.email}</Text>
          <Text style={text.muted}>{t(`role.${user.role}`)}</Text>
        </Card>
      ) : (
        <Card style={styles.gap}>
          <Header title={t('mobile.signedOutTitle')} subtitle={t('mobile.signedOutText')} />
          <Button label={t('nav.logIn')} onPress={() => router.push('/login')} />
          <Button label={t('nav.signUp')} variant="secondary" onPress={() => router.push('/register')} />
        </Card>
      )}

      {items.length > 0 && (
        <Card style={styles.list}>
          {items.map((item, index) => (
            <Pressable key={item.label} accessibilityRole="link" onPress={() => router.push(item.href)} style={[styles.item, index > 0 && styles.itemBorder]}>
              <Ionicons name={item.icon} size={22} color={colors.brand} />
              <Text style={[text.body, styles.flex]}>{t(item.label)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
      )}

      <Card style={styles.gap}>
        <Text style={text.subheading}>{t('mobile.settings')}</Text>
        <Select label={t('nav.language')} value={locale} onChange={(value) => setLocale(value as Locale)} options={locales.map((item) => ({ value: item.code, label: item.label }))} />
        <Text style={text.muted}>{t('mobile.server')}: {getServer()}</Text>
      </Card>

      {user && <Button label={t('nav.signOut')} variant="danger" onPress={signOut} />}
      <View style={styles.footer}>
        <Text style={text.muted}>{t('mobile.version', { version: Constants.expoConfig?.version ?? '' })}</Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  list: { paddingVertical: 4, gap: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  itemBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  footer: { alignItems: 'center' },
})
