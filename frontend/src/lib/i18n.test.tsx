import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider, useLocale } from './i18n'

function CurrentLocale() {
  return <p data-testid="locale">{useLocale().locale}</p>
}

function initialLocaleFor(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
  render(<LocaleProvider><CurrentLocale /></LocaleProvider>)
  return screen.getByTestId('locale').textContent
}

describe('initial locale', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('follows the first supported browser language', () => {
    expect(initialLocaleFor(['ru-RU', 'en-US'])).toBe('ru')
  })

  it('matches Kazakh by its primary subtag', () => {
    expect(initialLocaleFor(['de-DE', 'kk'])).toBe('kk')
  })

  it('falls back to Russian when no browser language is supported', () => {
    expect(initialLocaleFor(['de-DE', 'fr'])).toBe('ru')
  })

  it('prefers the saved choice over the browser language', () => {
    localStorage.setItem('biletflow.locale', 'en')
    expect(initialLocaleFor(['kk-KZ'])).toBe('en')
  })
})
