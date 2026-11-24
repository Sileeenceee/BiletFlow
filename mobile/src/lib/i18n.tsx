import { createContext, useContext, useState, type ReactNode } from 'react'
import { dictionaries, en, locales, type Locale, type MessageKey } from '../../../frontend/src/lib/messages'
import { setFormatLocale } from './format'
import { mobileDictionaries, mobileEn, type MobileKey } from './mobileMessages'
import { getStoredLocale, setStoredLocale } from './storage'

// The website's dictionaries (frontend/src/lib/messages.ts) plus the few texts
// that only exist in the app (mobileMessages.ts), in the same three languages.
export { locales, type Locale, type MessageKey }

export type TranslationKey = MessageKey | MobileKey
type Values = Record<string, string | number>
type Translate = (key: TranslationKey, values?: Values) => string
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: Translate }

export function isMessageKey(key: string): key is TranslationKey {
  return key in en || key in mobileEn
}

/** Label for a server enum value (status, role, type); unknown values are shown as the API sends them. */
export function enumLabel(t: Translate, key: string, raw: string): string {
  return isMessageKey(key) ? t(key) : raw
}

function translate(locale: Locale, key: TranslationKey, values?: Values) {
  const template = key in mobileEn
    ? mobileDictionaries[locale][key as MobileKey] ?? mobileEn[key as MobileKey]
    : dictionaries[locale][key as MessageKey] ?? en[key as MessageKey] ?? key
  return values ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? '')) : template
}

/** A saved choice wins; otherwise the device language when supported; otherwise Russian. */
function initialLocale(): Locale {
  const stored = getStoredLocale()
  if (locales.some((item) => item.code === stored)) return stored as Locale
  const device = Intl.DateTimeFormat().resolvedOptions().locale?.split('-')[0].toLowerCase()
  return locales.find((item) => item.code === device)?.code ?? 'ru'
}

function applyLocale(locale: Locale) {
  setFormatLocale(locales.find((item) => item.code === locale)!.format)
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => undefined,
  t: (key, values) => translate('en', key, values),
})

/** Render only after loadStoredState() has resolved, so a saved language is already known. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = initialLocale()
    applyLocale(initial)
    return initial
  })

  function setLocale(next: Locale) {
    setStoredLocale(next)
    applyLocale(next)
    setLocaleState(next)
  }

  const t: Translate = (key, values) => translate(locale, key, values)
  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
