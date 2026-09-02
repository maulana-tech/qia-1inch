import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type Locale = 'en' | 'id' | 'vi' | 'fil'
export type DisplayCurrency = 'usdc' | 'idr' | 'vnd' | 'php'

interface SettingsContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  currency: DisplayCurrency
  setCurrency: (currency: DisplayCurrency) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

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

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return ctx
}

const en = {
  // Settings page
  'settings.title': 'Settings',
  'page.settingsCaption': 'Language, currency, theme, and network details.',
  'settings.preferences': 'Preferences',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeSystem': 'System',
  'settings.aboutTitle': 'About',
  'settings.currency': 'Display currency',
  'settings.currencyIdr': 'Rupiah (IDR)',
  'settings.currencyUsdc': 'USDC',
  'settings.currencyVnd': 'Vietnamese Dong (VND)',
  'settings.currencyPhp': 'Philippine Peso (PHP)',
  'settings.preferencesHint':
    'Language and currency only change how amounts are displayed. They do not affect your wallet or the blockchain.',
  'settings.network': 'Network',
  'settings.networkTestnet': 'Base Sepolia',
  'settings.networkTestnetHint':
    'This app runs on Base Sepolia. Funds here are for testing only and have no real value.',
  'settings.contract': 'Contract',
  'settings.viewExplorer': 'View on explorer',
  'settings.copy': 'Copy',
  'settings.copied': 'Copied',
  'settings.about': 'Iqia is a privacy-preserving financial layer built on Base.',
  'settings.byline': 'Iqia App',
  'settings.langEn': 'English',
  'settings.langId': 'Bahasa Indonesia',
  'settings.langVi': 'Tiếng Việt',
  'settings.langFil': 'Filipino',

  // Navigation
  'nav.deposit': 'Bridge',
  'nav.pay': 'Pay',
  'nav.swap': 'Swap',
  'nav.receive': 'Receive',
  'nav.portfolio': 'Portfolio',
  'nav.faucet': 'Faucet',
  'nav.settings': 'Settings',
}

const id = {
  // Settings page
  'settings.title': 'Pengaturan',
  'page.settingsCaption': 'Bahasa, mata uang, tema, dan detail jaringan.',
  'settings.preferences': 'Preferensi',
  'settings.language': 'Bahasa',
  'settings.theme': 'Tema',
  'settings.themeLight': 'Terang',
  'settings.themeDark': 'Gelap',
  'settings.themeSystem': 'Ikuti sistem',
  'settings.aboutTitle': 'Tentang',
  'settings.currency': 'Mata uang tampilan',
  'settings.currencyIdr': 'Rupiah (IDR)',
  'settings.currencyUsdc': 'USDC',
  'settings.currencyVnd': 'Vietnamese Dong (VND)',
  'settings.currencyPhp': 'Philippine Peso (PHP)',
  'settings.preferencesHint':
    'Bahasa dan mata uang cuma mengubah tampilan angkanya. Dompet dan blockchain-mu tidak terpengaruh.',
  'settings.network': 'Jaringan',
  'settings.networkTestnet': 'Base Sepolia',
  'settings.networkTestnetHint':
    'Aplikasi ini jalan di Base Sepolia. Dana di sini cuma buat uji coba dan tidak bernilai sungguhan.',
  'settings.contract': 'Kontrak',
  'settings.viewExplorer': 'Lihat di explorer',
  'settings.copy': 'Salin',
  'settings.copied': 'Tersalin',
  'settings.about': 'Iqia adalah lapisan finansial penjaga privasi di Base.',
  'settings.byline': 'Aplikasi Iqia',
  'settings.langEn': 'English',
  'settings.langId': 'Bahasa Indonesia',
  'settings.langVi': 'Tiếng Việt',
  'settings.langFil': 'Filipino',

  // Navigation
  'nav.deposit': 'Setor / Tarik',
  'nav.pay': 'Kirim',
  'nav.swap': 'Tukar',
  'nav.receive': 'Terima',
  'nav.portfolio': 'Portofolio',
  'nav.faucet': 'Faucet',
  'nav.settings': 'Pengaturan',
}

const vi = {
  // Settings page
  'settings.title': 'Cài đặt',
  'page.settingsCaption': 'Ngôn ngữ, tiền tệ, giao diện và thông tin mạng.',
  'settings.preferences': 'Tùy chọn',
  'settings.language': 'Ngôn ngữ',
  'settings.theme': 'Giao diện',
  'settings.themeLight': 'Sáng',
  'settings.themeDark': 'Tối',
  'settings.themeSystem': 'Theo hệ thống',
  'settings.aboutTitle': 'Giới thiệu',
  'settings.currency': 'Tiền tệ hiển thị',
  'settings.currencyIdr': 'Rupiah (IDR)',
  'settings.currencyUsdc': 'USDC',
  'settings.currencyVnd': 'Vietnamese Dong (VND)',
  'settings.currencyPhp': 'Philippine Peso (PHP)',
  'settings.preferencesHint':
    'Ngôn ngữ và tiền tệ chỉ thay đổi cách hiển thị số tiền. Chúng không ảnh hưởng đến ví hay blockchain của bạn.',
  'settings.network': 'Mạng',
  'settings.networkTestnet': 'Base Sepolia',
  'settings.networkTestnetHint':
    'Ứng dụng này chạy trên Base Sepolia. Số tiền ở đây chỉ dùng để thử nghiệm và không có giá trị thật.',
  'settings.contract': 'Hợp đồng',
  'settings.viewExplorer': 'Xem trên explorer',
  'settings.copy': 'Sao chép',
  'settings.copied': 'Đã sao chép',
  'settings.about': 'Iqia là một lớp tài chính bảo mật được xây dựng trên Base.',
  'settings.byline': 'Ứng dụng Iqia',
  'settings.langEn': 'English',
  'settings.langId': 'Bahasa Indonesia',
  'settings.langVi': 'Tiếng Việt',
  'settings.langFil': 'Filipino',

  // Navigation
  'nav.deposit': 'Nạp / Rút',
  'nav.pay': 'Gửi',
  'nav.swap': 'Giao dịch',
  'nav.receive': 'Nhận',
  'nav.portfolio': 'Danh mục',
  'nav.faucet': 'Faucet',
  'nav.settings': 'Cài đặt',
}

const fil = {
  // Settings page
  'settings.title': 'Settings',
  'page.settingsCaption': 'Wika, currency, theme, at detalye ng network.',
  'settings.preferences': 'Mga Preference',
  'settings.language': 'Wika',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeSystem': 'System',
  'settings.aboutTitle': 'Tungkol Dito',
  'settings.currency': 'Currency na Ipapakita',
  'settings.currencyIdr': 'Rupiah (IDR)',
  'settings.currencyUsdc': 'USDC',
  'settings.currencyVnd': 'Vietnamese Dong (VND)',
  'settings.currencyPhp': 'Philippine Peso (PHP)',
  'settings.preferencesHint':
    'Ang wika at currency ay nagpapalit lang kung paano ipinapakita ang mga halaga. Hindi ito nakakaapekto sa wallet mo o sa blockchain.',
  'settings.network': 'Network',
  'settings.networkTestnet': 'Base Sepolia',
  'settings.networkTestnetHint':
    'Tumatakbo ang app na ito sa Base Sepolia. Ang mga funds dito ay pantesting lang at walang totoong value.',
  'settings.contract': 'Contract',
  'settings.viewExplorer': 'Tingnan sa explorer',
  'settings.copy': 'Kopyahin',
  'settings.copied': 'Nakopya',
  'settings.about': 'Ang Iqia ay isang privacy-preserving financial layer sa Base.',
  'settings.byline': 'Iqia App',
  'settings.langEn': 'English',
  'settings.langId': 'Bahasa Indonesia',
  'settings.langVi': 'Tiếng Việt',
  'settings.langFil': 'Filipino',

  // Navigation
  'nav.deposit': 'Mag-deposito / Mag-withdraw',
  'nav.pay': 'Magbayad',
  'nav.swap': 'I-swap',
  'nav.receive': 'Tumanggap',
  'nav.portfolio': 'Portfolio',
  'nav.faucet': 'Faucet',
  'nav.settings': 'Settings',
}

export type MessageKey = keyof typeof en

const messages: Record<Locale, Record<MessageKey, string>> = { en, id, vi, fil }

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const { locale } = useSettings()
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      const template = messages[locale]?.[key] || messages['en'][key]
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      )
    },
    [locale],
  )
}

export function intlLocale(locale: string): string {
  if (locale.startsWith('vi')) return 'vi-VN'
  if (locale.startsWith('fil')) return 'fil-PH'
  if (locale.startsWith('id')) return 'id-ID'
  return 'en-US'
}

export interface FxRates {
  idr: number
  vnd: number
  php: number
}

export const STATIC_RATES: FxRates = {
  idr: 16300,
  vnd: 25400,
  php: 58.5,
}

export function formatMoney(
  amountUsd: number,
  currency: DisplayCurrency,
  locale: string,
): string {
  if (currency === 'usdc') {
    const formatted = new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amountUsd)
    return `${formatted} USDC`
  }
  const rate = STATIC_RATES[currency as keyof FxRates] || 1
  const converted = amountUsd * rate
  const digits = currency === 'php' ? 2 : 0
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(converted)
}

export function currencyAffix(
  currency: 'idr' | 'vnd' | 'php',
  locale: string,
): { symbol: string; position: 'prefix' | 'suffix' } {
  const parts = new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).formatToParts(1)
  const currencyIndex = parts.findIndex((p) => p.type === 'currency')
  const integerIndex = parts.findIndex((p) => p.type === 'integer')
  const symbol = parts[currencyIndex]?.value ?? ''
  return { symbol, position: currencyIndex < integerIndex ? 'prefix' : 'suffix' }
}
