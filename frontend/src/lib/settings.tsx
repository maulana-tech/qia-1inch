/**
 * Provider setelan, dan HANYA itu.
 *
 * Tipe, hook, kamus, dan helper mata uang ada di `settingsContext.ts` — bukan
 * karena berkas ini kepanjangan, tapi supaya fast refresh Vite bisa bekerja.
 * Berkas yang mengekspor komponen DAN hal lain memaksa muat ulang penuh setiap
 * kali disunting, dan muat ulang penuh berarti dompet terputus.
 */
import { useState, useCallback, type ReactNode } from 'react'

import { SettingsContext, type DisplayCurrency, type Locale } from './settingsContext'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem('iqia.locale')
      return (saved as Locale) || 'en'
    } catch {
      return 'en'
    }
  })

  const [currency, setCurrencyState] = useState<DisplayCurrency>(() => {
    try {
      const saved = localStorage.getItem('iqia.currency')
      return (saved as DisplayCurrency) || 'usdc'
    } catch {
      return 'usdc'
    }
  })

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem('iqia.locale', newLocale)
    } catch {
      // storage unavailable
    }
  }, [])

  const setCurrency = useCallback((newCurrency: DisplayCurrency) => {
    setCurrencyState(newCurrency)
    try {
      localStorage.setItem('iqia.currency', newCurrency)
    } catch {
      // storage unavailable
    }
  }, [])

  return (
    <SettingsContext.Provider value={{ locale, setLocale, currency, setCurrency }}>
      {children}
    </SettingsContext.Provider>
  )
}
