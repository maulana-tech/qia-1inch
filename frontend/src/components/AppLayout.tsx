import { NavLink, Outlet } from 'react-router-dom'
import { useIqia } from '../hooks/useIqia'
import { useReveal } from '../hooks/useReveal'

import { clearAllNotes } from '../lib/note-store'
import { cx } from '../lib/cx'
import { BrandCanvas } from './BrandCanvas'
import { ConnectWallet } from './ConnectWallet'
import { EyeGlyph, SettingsIcon, FaucetIcon } from './ui'
import iqiaLogo from '../assets/iqia-logo.png'
import { ScrambleNumber } from './ScrambleNumber'
import { ThemeToggle } from './ThemeToggle'
import { useT, useSettings, formatMoney } from '../lib/settings'

const NAV = [
  ['nav.deposit', '/deposit'],
  ['nav.pay', '/pay'],
  ['nav.swap', '/swap'],
  ['nav.receive', '/receive'],
  ['nav.portfolio', '/portfolio'],
] as const

function ShieldedChip() {
  const { balances, loadingBalances } = useIqia()
  const { revealed, toggle } = useReveal()
  const { currency, locale } = useSettings()
  if (loadingBalances || balances.length === 0) return null
  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)
  return (
    <div className="hidden items-center gap-2 md:flex">
      <span className="coord-label">shielded</span>
      <ScrambleNumber value={formatMoney(total, currency, locale)} revealed={revealed} className="font-mono text-sm text-spectral-soft" />
      <button
        type="button"
        onClick={toggle}
        aria-label={revealed ? 'Hide balance' : 'Reveal balance'}
        className="text-spectral/50 transition hover:text-spectral"
      >
        <EyeGlyph off={!revealed} className="h-4 w-4" />
      </button>
    </div>
  )
}

function AppNav() {
  const t = useT()
  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-none bg-ink-900/75 px-5 py-2.5 shadow-[0_12px_34px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <NavLink to="/app" className="flex items-center gap-2.5">
          <img src={iqiaLogo} alt="Iqia" className="h-12 w-auto object-contain" />
          <span className="font-display text-base font-semibold tracking-tight text-spectral-soft">
            iqia
          </span>
        </NavLink>
        <nav className="hidden items-center gap-5 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] md:flex">
          {NAV.map(([key, to]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'transition hover:text-spectral-soft',
                  isActive
                    ? 'text-spectral-soft underline decoration-patina-400 decoration-2 underline-offset-[7px]'
                    : 'text-spectral/80',
                )
              }
            >
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ShieldedChip />
          <NavLink
            to="/faucet"
            title={t('nav.faucet')}
            aria-label={t('nav.faucet')}
            className={({ isActive }) =>
              cx(
                'inline-flex h-8 w-8 items-center justify-center rounded-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral/40',
                isActive
                  ? 'bg-zinc-200/50 text-zinc-950 dark:bg-ink-800 dark:text-spectral-soft'
                  : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-spectral/60 dark:hover:bg-ink-800 dark:hover:text-spectral-soft',
              )
            }
          >
            <FaucetIcon className="h-4 w-4" />
          </NavLink>
          <ThemeToggle />
          <NavLink
            to="/settings"
            title={t('nav.settings')}
            aria-label={t('nav.settings')}
            className={({ isActive }) =>
              cx(
                'inline-flex h-8 w-8 items-center justify-center rounded-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral/40',
                isActive
                  ? 'bg-zinc-200/50 text-zinc-950 dark:bg-ink-800 dark:text-spectral-soft'
                  : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-spectral/60 dark:hover:bg-ink-800 dark:hover:text-spectral-soft',
              )
            }
          >
            <SettingsIcon className="h-4 w-4" />
          </NavLink>
          <ConnectWallet />
        </div>
      </div>
    </header>
  )
}

function AppFooter() {
  const { refreshBalances } = useIqia()

  async function clearLocalData() {
    const ok = window.confirm(
      'Clear locally-cached shielded notes on this device?\n\nYour wallet stays connected — this only removes the notes/balance stored in this browser. Any on-chain funds tied to older notes stay on-chain.',
    )
    if (!ok) return
    clearAllNotes()
    await refreshBalances()
  }
  return (
    <footer className="cream-panel relative mt-auto">
      {/* Grain eases in over the top edge so it settles into the wash above
          instead of popping at the boundary. */}
      <div
        aria-hidden
        className="wr-grain absolute inset-0 opacity-40"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 4rem)',
          maskImage: 'linear-gradient(to bottom, transparent, #000 4rem)',
        }}
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-5 px-8 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <NavLink to="/" className="transition hover:opacity-75 flex items-center gap-3">
            <img src={iqiaLogo} alt="Iqia" className="h-[150px] w-auto object-contain" style={{ opacity: 0.85 }} />
            <span className="font-display text-xl font-semibold tracking-tight text-zinc-950/80 dark:text-zinc-100">
              iqia
            </span>
          </NavLink>
          <p className="max-w-[18rem] text-[12.5px] font-normal leading-relaxed text-[#1f1f1f]/70 dark:text-zinc-400">
            Private money on Base. Bridge in, hold, pay and trade — proven on-chain, never revealed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#141414]/55 dark:text-zinc-500">
          <NavLink to="/faucet" className="transition hover:text-[#1f1f1f] dark:hover:text-zinc-200">
            Faucet
          </NavLink>
          <button type="button" onClick={() => void clearLocalData()} className="uppercase transition hover:text-[#1f1f1f] dark:hover:text-zinc-200">
            Clear data
          </button>
            <span className="text-[#1f1f1f]/40 dark:text-zinc-600">© Iqia 2026</span>
        </div>
      </div>
    </footer>
  )
}

/** Persistent app shell: the BrandCanvas world, router nav and cream footer wrap
 *  every routed surface (hub, bridge, pay, swap, receive, faucet). */
export function AppLayout() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <BrandCanvas />
      <AppNav />
      <main className="relative flex-1">
        <Outlet />
      </main>
      {/* Long, eased wash so the fixed dark canvas dissolves into the footer
          over a tall multi-stop ramp — the section change reads as one surface.
          No grain of its own: the fixed canvas grain shows through the transparent
          top and is naturally covered as the wash turns opaque. */}
      <div
        aria-hidden
        className="pointer-events-none relative h-[30rem] footer-gradient-wash"
      />
      <AppFooter />
    </div>
  )
}

export default AppLayout
