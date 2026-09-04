import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowDownToLineIcon,
  ArrowUpRightIcon,
  ExternalLinkIcon,
  LayersIcon,
  PanelLeftIcon,
  PiggyBankIcon,
  QrCodeIcon,
  DropletsIcon,
  SettingsIcon,
  WalletIcon,
} from 'lucide-react'

import { useIqia } from '../hooks/useIqia'
import { useReveal } from '../hooks/useReveal'
import { cx } from '../lib/cx'
import { BrandCanvas } from './BrandCanvas'
import { ConnectWallet } from './ConnectWallet'
import { EyeGlyph } from './ui'
import { Logo, LogoMark } from './Logo'
import { ScrambleNumber } from './ScrambleNumber'
import { ThemeToggle } from './ThemeToggle'
import { useT, useSettings, formatMoney } from '../lib/settings'
import { SWAP_VM_ROUTER_ADDRESS, AQUA_CONFIGURED, explorerContractUrl } from '../lib/config'

/**
 * Kerangka aplikasi: sidebar yang bisa diciutkan jadi rail, konten di kanan.
 *
 * Menggantikan bilah navigasi atas. Dengan bertambahnya halaman, deretan
 * horizontal kehabisan ruang dan kehilangan pengelompokan — sidebar memberi
 * seksi bernama, dan rail menyimpannya tanpa membuang konteks.
 *
 * Lebar sidebar disimpan di localStorage supaya pilihan pengguna bertahan.
 */

const SIDEBAR_KEY = 'iqia.sidebar.rail'

interface NavItem {
  to: string
  label: string
  icon: typeof LayersIcon
  end?: boolean
}

const SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'markets',
    items: [
      { to: '/app', label: 'Markets', icon: LayersIcon, end: true },
      { to: '/swap', label: 'Swap', icon: ArrowUpRightIcon },
      { to: '/savings', label: 'Savings', icon: PiggyBankIcon },
    ],
  },
  {
    heading: 'wallet',
    items: [
      { to: '/portfolio', label: 'Portfolio', icon: WalletIcon },
      { to: '/deposit', label: 'Deposit', icon: ArrowDownToLineIcon },
      { to: '/receive', label: 'Receive', icon: QrCodeIcon },
      { to: '/faucet', label: 'Faucet', icon: DropletsIcon },
    ],
  },
]

const ITEM =
  'flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-spectral/40'

function SectionLabel({ rail, children }: { rail: boolean; children: string }) {
  if (rail) return <div className="pt-4" />
  return (
    <p className="px-3 pb-1.5 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-spectral/38">
      {children}
    </p>
  )
}

function SidebarContent({
  rail,
  onToggle,
  onNavigate,
}: {
  rail: boolean
  onToggle?: () => void
  onNavigate?: () => void
}) {
  const label = rail ? 'sr-only' : ''

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      ITEM,
      rail && 'justify-center px-0',
      isActive
        ? 'bg-spectral/10 text-spectral'
        : 'text-spectral/62 hover:bg-spectral/[0.06] hover:text-spectral/90',
    )

  return (
    <div className="flex h-full flex-col p-3">
      <div className={cx('flex items-center pb-2 pt-1', rail ? 'justify-center' : 'justify-between px-2')}>
        <NavLink to="/app" onClick={onNavigate} className={cx('flex items-center', rail && 'hidden')}>
          <Logo markClassName="h-6 w-6" />
        </NavLink>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={rail ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            className="rounded-md p-2 text-spectral/45 transition hover:bg-spectral/[0.06] hover:text-spectral"
          >
            <PanelLeftIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.heading}>
            <SectionLabel rail={rail}>{section.heading}</SectionLabel>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={itemClass}
                title={rail ? item.label : undefined}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className={label}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-2 border-t border-spectral/10 pt-2">
        <SectionLabel rail={rail}>protocol</SectionLabel>
        <NavLink to="/settings" onClick={onNavigate} className={itemClass} title={rail ? 'Settings' : undefined}>
          <SettingsIcon className="h-[18px] w-[18px] shrink-0" />
          <span className={label}>Settings</span>
        </NavLink>
        {AQUA_CONFIGURED ? (
          <a
            href={explorerContractUrl(SWAP_VM_ROUTER_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className={cx(ITEM, rail && 'justify-center px-0', 'text-spectral/62 hover:bg-spectral/[0.06] hover:text-spectral/90')}
            title={rail ? 'Router' : undefined}
          >
            <ExternalLinkIcon className="h-[18px] w-[18px] shrink-0" />
            <span className={label}>Router</span>
          </a>
        ) : null}
      </div>
    </div>
  )
}

function ShieldedChip() {
  const { balances, loadingBalances } = useIqia()
  const { revealed, toggle } = useReveal()
  const { currency, locale } = useSettings()
  if (loadingBalances || balances.length === 0) return null
  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)
  return (
    <div className="hidden items-center gap-2 md:flex">
      <span className="coord-label">balance</span>
      <ScrambleNumber
        value={formatMoney(total, currency, locale)}
        revealed={revealed}
        className="font-mono text-sm text-spectral-soft"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={revealed ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
        className="text-spectral/50 transition hover:text-spectral"
      >
        <EyeGlyph off={!revealed} className="h-4 w-4" />
      </button>
    </div>
  )
}

export function AppLayout() {
  const t = useT()
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, rail ? '1' : '0')
    } catch {
      // Penyimpanan bisa ditolak di mode privat. Lebar sidebar bukan hal yang
      // pantas menggagalkan render.
    }
  }, [rail])

  return (
    <div className="relative min-h-screen">
      <BrandCanvas />

      {/* Sidebar tetap, layar besar */}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 hidden border-r border-spectral/10 bg-ink-900/80 backdrop-blur-xl transition-[width] duration-200 lg:block',
          rail ? 'w-[68px]' : 'w-60',
        )}
      >
        <SidebarContent rail={rail} onToggle={() => setRail((v) => !v)} />
      </aside>

      {/* Laci, layar kecil */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-spectral/10 bg-ink-900">
            <SidebarContent rail={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className={cx('transition-[padding] duration-200', rail ? 'lg:pl-[68px]' : 'lg:pl-60')}>
        <header className="sticky top-0 z-30 border-b border-spectral/10 bg-ink-900/70 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Buka menu"
                className="rounded-md p-2 text-spectral/60 transition hover:bg-spectral/[0.06] hover:text-spectral lg:hidden"
              >
                <PanelLeftIcon className="h-4 w-4" />
              </button>
              <NavLink to="/app" className="flex items-center lg:hidden">
                <LogoMark className="h-6 w-6" />
              </NavLink>
            </div>

            <div className="flex items-center gap-4">
              <ShieldedChip />
              <ThemeToggle />
              <ConnectWallet />
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-3.5rem)]">
          <Outlet />
        </main>

        <footer className="border-t border-spectral/10 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-spectral/40">
            <span>{t('nav.portfolio') ? 'iqia · 1inch aqua' : 'iqia'}</span>
            <NavLink to="/" className="transition hover:text-spectral/70">
              ← landing
            </NavLink>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default AppLayout
