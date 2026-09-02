import { useState } from 'react'
import { Act } from '../components/Act'
import { useSettings, useT, type Locale, type DisplayCurrency } from '../lib/settings'
import { useTheme } from '../hooks/useTheme'
import { POOL_CONTRACT_ID } from '../lib/config'
import { cx } from '../lib/cx'

export function SettingsPage() {
  const { locale, setLocale, currency, setCurrency } = useSettings()
  const { theme, setTheme } = useTheme()
  const t = useT()

  const [copiedPool, setCopiedPool] = useState(false)

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setter(true)
      setTimeout(() => setter(false), 2000)
    })
  }

  const locales: { code: Locale; label: string }[] = [
    { code: 'en', label: t('settings.langEn') },
    { code: 'id', label: t('settings.langId') },
    { code: 'vi', label: t('settings.langVi') },
    { code: 'fil', label: t('settings.langFil') },
  ]

  const currencies: { code: DisplayCurrency; label: string }[] = [
    { code: 'usdc', label: t('settings.currencyUsdc') },
    { code: 'idr', label: t('settings.currencyIdr') },
    { code: 'vnd', label: t('settings.currencyVnd') },
    { code: 'php', label: t('settings.currencyPhp') },
  ]

  return (
    <Act
      no="Act 05"
      id="act-settings"
      title={t('settings.title')}
      standfirst={t('page.settingsCaption')}
      coords={['Settings', 'Configuration']}
    >
      <div className="space-y-8 rounded-none border border-spectral/10 bg-ink-900/40 p-6 backdrop-blur-sm">
        
        {/* Preference settings */}
        <section className="space-y-6">
          <h3 className="font-mono text-xs uppercase tracking-wider text-spectral/40">
            {t('settings.preferences')}
          </h3>

          {/* Language Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-spectral-soft">
              {t('settings.language')}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {locales.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLocale(l.code)}
                  className={cx(
                    'rounded-none border py-2.5 text-xs font-semibold uppercase tracking-wider transition font-mono',
                    locale === l.code
                      ? 'border-patina-400 bg-patina-400/10 text-spectral-soft'
                      : 'border-spectral/12 bg-ink-950/20 text-spectral/60 hover:border-red-500 hover:text-spectral-soft',
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Currency Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-spectral-soft">
              {t('settings.currency')}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {currencies.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCurrency(c.code)}
                  className={cx(
                    'rounded-none border py-2.5 text-xs font-semibold uppercase tracking-wider transition font-mono',
                    currency === c.code
                      ? 'border-patina-400 bg-patina-400/10 text-spectral-soft'
                      : 'border-spectral/12 bg-ink-950/20 text-spectral/60 hover:border-red-500 hover:text-spectral-soft',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-spectral/40 mt-1">
              {t('settings.preferencesHint')}
            </p>
          </div>

          {/* Theme Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-spectral-soft">
              {t('settings.theme')}
            </label>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((tCode) => (
                <button
                  key={tCode}
                  type="button"
                  onClick={() => setTheme(tCode)}
                  className={cx(
                    'flex-1 rounded-none border py-2.5 text-xs font-semibold uppercase tracking-wider transition font-mono',
                    theme === tCode
                      ? 'border-patina-400 bg-patina-400/10 text-spectral-soft'
                      : 'border-spectral/12 bg-ink-950/20 text-spectral/60 hover:border-red-500 hover:text-spectral-soft',
                  )}
                >
                  {tCode === 'light' ? t('settings.themeLight') : t('settings.themeDark')}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="h-px bg-spectral/10" />

        {/* Network & Contract Details */}
        <section className="space-y-4">
          <h3 className="font-mono text-xs uppercase tracking-wider text-spectral/40">
            {t('settings.network')}
          </h3>

          <div className="rounded-none border border-spectral/8 bg-ink-950/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-spectral/50">
                Network
              </span>
              <span className="rounded-none bg-patina-400/10 px-2 py-0.5 font-mono text-xs font-semibold text-patina-400">
                {t('settings.networkTestnet')}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-spectral/40">
              {t('settings.networkTestnetHint')}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-mono uppercase tracking-wider text-spectral/50">
              {t('settings.contract')} (Larel Pool)
            </label>
            <div className="flex items-center gap-2 rounded-none border border-spectral/8 bg-ink-950/30 px-3 py-2">
              <span className="font-mono text-xs text-spectral/75 select-all truncate flex-1">
                {POOL_CONTRACT_ID}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(POOL_CONTRACT_ID, setCopiedPool)}
                className="text-[11px] font-mono uppercase tracking-wider text-patina-400/80 hover:text-patina-400 px-2 py-1 hover:bg-patina-400/5 rounded-none transition shrink-0"
              >
                {copiedPool ? t('settings.copied') : t('settings.copy')}
              </button>
            </div>
          </div>

          <div className="rounded-none border border-spectral/8 bg-ink-950/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-spectral/50">
                Chain
              </span>
              <span className="rounded-none bg-patina-400/10 px-2 py-0.5 font-mono text-xs font-semibold text-patina-400">
                Flare Coston2
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-spectral/40">
              EVM-compatible testnet. Native token: FLR.
            </p>
          </div>
        </section>

        <div className="h-px bg-spectral/10" />

        {/* About Info */}
        <section className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-spectral/40">
            {t('settings.aboutTitle')}
          </h3>
          <p className="text-xs leading-relaxed text-spectral/70">
            {t('settings.about')}
          </p>
          <p className="text-[10px] font-mono tracking-wider text-spectral/40">
            {t('settings.byline')}
          </p>
        </section>

      </div>
    </Act>
  )
}

export default SettingsPage
