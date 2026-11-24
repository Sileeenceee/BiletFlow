import { createContext, useContext, useState, type ReactNode } from 'react'
import { setFormatLocale } from './format'
import { dictionaries, en, locales, type Locale, type MessageKey } from './messages'

export { isMessageKey, locales, type Locale, type MessageKey } from './messages'

const STORAGE_KEY = 'biletflow.locale'

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: Translate }

function translate(locale: Locale, key: MessageKey, values?: Record<string, string | number>) {
  const template = dictionaries[locale][key] ?? en[key]
  return values ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? '')) : template
}

/** A saved choice wins; otherwise the first supported browser language; otherwise Russian. */
function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (locales.some((item) => item.code === stored)) return stored as Locale
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of preferred) {
    const primary = language?.split('-')[0].toLowerCase()
    const match = locales.find((item) => item.code === primary)
    if (match) return match.code
  }
  return 'ru'
}

function applyLocale(locale: Locale) {
  setFormatLocale(locales.find((item) => item.code === locale)!.format)
  document.documentElement.lang = locale
}

// Pages rendered without a provider (unit tests) fall back to English.
const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => undefined,
  t: (key, values) => translate('en', key, values),
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = initialLocale()
    applyLocale(initial)
    return initial
  })

  function setLocale(next: Locale) {
    localStorage.setItem(STORAGE_KEY, next)
    applyLocale(next)
    setLocaleState(next)
  }

  const t: Translate = (key, values) => translate(locale, key, values)
  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
