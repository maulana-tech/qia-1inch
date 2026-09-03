import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import ScrambleCycle from './ScrambleCycle'

import { Logo } from './Logo'
import { BentoGrid } from './BentoGrid'
import { StoryStack } from './StoryStack'
import { Mechanics } from './Mechanics'
import { CHAIN_NAME } from '../lib/config'
import { ThemeToggle } from './ThemeToggle'
import { useIsDark } from '../hooks/useTheme'

const ROTATING = ['in your wallet', 'unlocked', 'yours', 'never pooled', 'put to work']


const NET_TITLE = ['Testnet']
const NET_VALUE = ['Base · Base Sepolia']
const PROOF_TITLE = ['Proof']
const PROOF_VALUE = ['UltraHonk · BN254']
const SHIELD_TITLE = ['Liquidity']
const SHIELD_VALUE = ['1inch Aqua · SwapVM']

const GRID_V = 'rgba(255,255,255,0.06)'
const GRID_H = 'rgba(255,255,255,0.09)'
const GRID_V_LIGHT = 'rgba(25,25,25,0.06)'
const GRID_H_LIGHT = 'rgba(25,25,25,0.09)'


function ChartBackground() {
  const fade = 'radial-gradient(125% 105% at 50% 46%, #000 40%, transparent 100%)'
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--grid-v) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-h) 1px, transparent 1px)',
          backgroundSize: '192px 138px',
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
      />
    </div>
  )
}


function Readouts({ dark }: { dark: boolean }) {
  const textColor = dark ? 'text-[#ffffff]/50' : 'text-[#191919]/50'
  const textHighlight = dark ? 'text-[#ffffff]/85' : 'text-[#191919]/85'
  const rule = dark ? 'border-[#ffffff]/12' : 'border-[#191919]/12'
  const rows = [
    { title: NET_TITLE, value: NET_VALUE, td: 620, vd: 900 },
    { title: PROOF_TITLE, value: PROOF_VALUE, td: 820, vd: 1150 },
    { title: SHIELD_TITLE, value: SHIELD_VALUE, td: 1040, vd: 1400 },
  ]
  return (
    <ul
      className={`flex flex-row flex-wrap justify-start w-full gap-x-10 gap-y-6 font-mono text-[10px] uppercase tracking-[0.14em] ${textColor}`}
      style={{ opacity: 'var(--grid-op, 1)' }}
    >
      {rows.map((r, i) => (
        <li key={r.title[0]} className={`flex flex-col ${i > 0 ? `border-l ${rule} pl-8` : ''}`}>
          <span className={`block ${textHighlight}`}>
            <ScrambleCycle words={r.title} duration={r.td} glitch={false} once />
          </span>
          <span className="mt-1.5 block">
            [ <ScrambleCycle words={r.value} duration={r.vd} glitch={false} once /> ]
          </span>
        </li>
      ))}
    </ul>
  )
}

interface FooterLink {
  label: string
  href: string
  external?: boolean
}

/** Satu kolom tautan di footer. Semua tautan menuju halaman yang benar-benar ada. */
function FooterNav({ dark, heading, links }: { dark: boolean; heading: string; links: FooterLink[] }) {
  return (
    <nav aria-label={heading}>
      <h2
        className="font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: dark ? 'rgba(255,255,255,0.42)' : 'rgba(25,25,25,0.42)' }}
      >
        {heading}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="text-[13.5px] transition hover:opacity-70"
              style={{ color: dark ? 'rgba(255,255,255,0.72)' : 'rgba(25,25,25,0.72)' }}
            >
              {l.label}
              {l.external ? <span aria-hidden> ↗</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Word({ children }: { children: string }) {
  return <span className="inline-block">{children}</span>
}

export function Landing({ onEnter }: { onEnter: () => void }) {
  // Smooth section scrolling is driven by the ScrollStack's window-scroll Lenis
  const heroRef = useRef<HTMLElement>(null)
  const dark = useIsDark()

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.6)))
      const a = 1 - p // grid + labels fade out as the story scrolls up
      const colorPrefix = dark ? '255,255,255' : '25,25,25'
      el.style.setProperty('--grid-v', `rgba(${colorPrefix},${(0.06 * a).toFixed(3)})`)
      el.style.setProperty('--grid-h', `rgba(${colorPrefix},${(0.09 * a).toFixed(3)})`)
      el.style.setProperty('--grid-op', a.toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [dark])

  return (
    <div
      className="relative w-full transition-colors duration-300"
      style={{
        backgroundColor: dark ? '#191919' : '#ffffff',
        color: dark ? '#ffffff' : '#191919',
      }}
    >
      <section
        ref={heroRef}
        className="relative min-h-screen w-full overflow-hidden"
        style={{ '--grid-v': dark ? GRID_V : GRID_V_LIGHT, '--grid-h': dark ? GRID_H : GRID_H_LIGHT, '--grid-op': 1 } as CSSProperties}
      >
      
      <ChartBackground />

      {/* Header — fixed, inverts against whatever scrolls behind it. */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="flex items-center justify-between px-8 py-5">
          <a
            href="/"
            className={`flex items-center ${dark ? 'text-[#ffffff]' : 'text-[#191919]'}`}
            aria-label="Iqia — beranda"
          >
            <Logo markClassName="h-7 w-7" />
          </a>
          <nav className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-[0.18em]">
            <a href="/faucet" className={`transition ${dark ? 'text-[#ffffff]/70 hover:text-[#ffffff]' : 'text-[#191919]/70 hover:text-[#191919]'}`}>
              Faucet
            </a>
            <ThemeToggle />
            <button onClick={onEnter} className={`transition ${dark ? 'text-[#ffffff]/70 hover:text-[#ffffff]' : 'text-[#191919]/70 hover:text-[#191919]'}`}>
              Enter →
            </button>
          </nav>
        </div>
      </header>

      
      <div className="relative z-10 flex min-h-screen items-center">
        <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 items-center gap-14 px-6 pb-28 pt-32 sm:px-10 lg:grid-cols-12 lg:gap-10 lg:px-16 lg:pb-24">
          <div className="lg:col-span-6 xl:col-span-6">
            <span
              className={`block font-mono text-[10px] uppercase tracking-[0.28em] ${dark ? 'text-[#ffffff]/55' : 'text-[#191919]/55'}`}
            >
              [ Base · 1inch Aqua · SwapVM ]
            </span>

            <h1
              className="mt-7 font-display font-medium uppercase leading-[0.98] tracking-[-0.04em]"
              style={{
                fontSize: 'clamp(2.4rem, 6.2vw, 5.25rem)',
                color: dark ? '#fafafa' : '#191919',
              }}
            >
              <span className="flex flex-wrap gap-x-[0.26em]">
                <Word>liquidity</Word>
                <Word>that</Word>
              </span>
              <span className="flex flex-wrap gap-x-[0.26em]">
                <Word>always</Word>
                <Word>stays</Word>
              </span>
              <span className="block">
                <ScrambleCycle words={ROTATING} duration={900} hold={2000} />
              </span>
            </h1>

            <p
              className={`mt-8 max-w-xl text-[15px] font-medium leading-relaxed ${dark ? 'text-[#ffffff]/70' : 'text-[#191919]/70'}`}
            >
              A trading desk built on 1inch Aqua. Market makers keep their tokens in their own
              wallets — Aqua records an allowance, never a deposit — and the pricing rules run
              as SwapVM bytecode instead of a hand-written contract.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <button
                onClick={onEnter}
                className="inline-flex items-center gap-2 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] transition hover:opacity-80"
                style={{
                  backgroundColor: dark ? '#ffffff' : '#191919',
                  color: dark ? '#101010' : '#ffffff',
                }}
              >
                Enter app →
              </button>
              <a
                href="/faucet"
                className={`inline-flex items-center gap-2 border px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] transition ${
                  dark
                    ? 'border-[#ffffff]/25 text-[#ffffff]/80 hover:border-[#ffffff]/60 hover:text-[#ffffff]'
                    : 'border-[#191919]/25 text-[#191919]/80 hover:border-[#191919]/60 hover:text-[#191919]'
                }`}
              >
                Get testnet funds
              </a>
            </div>
            <div className="mt-16 w-full opacity-80 pt-6 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
              <Readouts dark={dark} />
            </div>
          </div>

          <div className="lg:col-span-6 lg:col-start-7 lg:flex lg:flex-col lg:justify-center gap-10 relative z-20 mt-10 lg:mt-0">
            <div className="relative w-full overflow-hidden rounded-none">
              <video 
                src="/video.webm" 
                autoPlay 
                loop 
                muted 
                playsInline 
                className={`w-full h-auto block transform scale-110 ${
                  dark ? 'invert mix-blend-screen opacity-90' : 'mix-blend-multiply'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Scroll cue — pinned bottom-left, on the same rail as the headline. */}
        <span
          className={`absolute bottom-10 left-6 font-mono text-[11px] uppercase tracking-[0.3em] sm:left-10 lg:left-16 ${dark ? 'text-[#ffffff]/55' : 'text-[#191919]/55'}`}
        >
          scroll ↓
        </span>
      </div>

      
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[32rem]"
        style={{
          background: dark
            ? 'linear-gradient(to bottom, rgba(16,16,16,0) 0%, rgba(16,16,16,0) 48%, rgba(16,16,16,0.35) 70%, rgba(16,16,16,0.72) 86%, rgba(16,16,16,0.92) 94%, #101010 100%)'
            : 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 48%, rgba(255,255,255,0.35) 70%, rgba(255,255,255,0.72) 86%, rgba(255,255,255,0.92) 94%, #ffffff 100%)',
        }}
      />
      </section>

      <BentoGrid onEnter={onEnter} />

      <StoryStack />

      <Mechanics />

      <footer
        className="relative border-t px-6 pb-10 pt-14 transition-colors duration-300 sm:px-10 lg:px-16"
        style={{
          backgroundColor: dark ? '#101010' : '#ffffff',
          color: dark ? '#ffffff' : '#191919',
          borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(25,25,25,0.10)',
        }}
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <a href="/" className="inline-flex transition hover:opacity-75" aria-label="Iqia — beranda">
                <Logo markClassName="h-7 w-7" />
              </a>
              <p
                className="mt-4 max-w-[22rem] text-[13px] leading-relaxed"
                style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(25,25,25,0.55)' }}
              >
                A trading desk on 1inch Aqua. Liquidity stays in the maker's wallet; the pricing
                rules run as SwapVM bytecode.
              </p>
            </div>

            <FooterNav
              dark={dark}
              heading="App"
              links={[
                { label: 'Markets', href: '/app' },
                { label: 'Swap', href: '/swap' },
                { label: 'Deposit', href: '/deposit' },
                { label: 'Portfolio', href: '/portfolio' },
              ]}
            />

            <FooterNav
              dark={dark}
              heading="Wallet"
              links={[
                { label: 'Pay', href: '/pay' },
                { label: 'Receive', href: '/receive' },
                { label: 'Settings', href: '/settings' },
              ]}
            />

            <FooterNav
              dark={dark}
              heading="Protocol"
              links={[
                { label: 'Source', href: 'https://github.com/maulana-tech/qia-1inch', external: true },
                { label: '1inch Aqua', href: 'https://github.com/1inch/aqua', external: true },
                { label: 'SwapVM', href: 'https://github.com/1inch/swap-vm', external: true },
              ]}
            />
          </div>

          <div
            className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6 font-mono text-[11px] uppercase tracking-[0.14em]"
            style={{
              borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(25,25,25,0.10)',
              color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(25,25,25,0.45)',
            }}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: dark ? '#7ee2a8' : '#1a8f4a' }}
                aria-hidden
              />
              {CHAIN_NAME} · testnet
            </span>
            <span>© Iqia 2026</span>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="transition hover:opacity-70"
            >
              Back to top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
