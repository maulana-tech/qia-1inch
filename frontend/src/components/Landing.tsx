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

const STACK_MARKS = ['1inch Aqua', 'SwapVM', 'Base', 'Noir · UltraHonk', 'Foundry']

const ROTATING = ['in your wallet', 'unlocked', 'yours', 'never pooled', 'put to work']






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
      const a = 1 - p // label memudar saat cerita bergulir naik

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
        style={{ '--grid-op': 1 } as CSSProperties}
      >
      

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

      
      {/* Hero — mengikuti pola Tailark Dusk hero-section-5: media full-bleed di
          belakang, konten menempel di bawah, judul dan ajakan sebaris.

          Tiga penyesuaian dari sumbernya:
          - utilitas mask-* di sana Tailwind v4; kita v3.4, jadi mask-nya ditulis
            sebagai CSS langsung
          - tanpa lucide-react, ikonnya SVG inline
          - tanpa next/link dan tombol shadcn, memakai gaya tombol yang sudah ada */}
      <div className="relative z-10 flex min-h-screen flex-col justify-end">
        {/* Media latar. aria-hidden: murni dekoratif, tidak membawa informasi. */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {/* Banner Aqua resmi 1inch, dibawa ke repo (public/) supaya demo tidak
              bergantung pada CDN pihak lain.

              Gambarnya persegi 1080² dengan wordmark "1inch Aqua" tepat di
              tengah. Dibentang penuh, wordmark itu mendarat persis di belakang
              judul dan keduanya sama-sama kalah. Jadi ia dipasang sebagai panel
              persegi di kanan — judul di kiri, banner di kanan, masing-masing
              punya ruang. Di layar sempit ia melebar menutupi latar, dan scrim
              di bawahnya yang menjaga teks tetap terbaca.

              Kecepatannya tidak bisa diperlambat seperti video sebelumnya; GIF
              tidak punya playbackRate. */}
          {/* Dua mask di dua lapis, bukan satu elemen dengan dua gradient:
              mask-composite masih berbeda-beda antar mesin, sedangkan mask
              bersarang selalu berlaku.

              Pembungkusnya berukuran PERSIS sebesar panelnya (persegi, setinggi
              layar), supaya persen pada mask horizontalnya dihitung terhadap
              panel — bukan terhadap lebar layar. Versi pertama memakai inset-0
              dan pudarnya selesai di 32% layar, jauh sebelum tepi panel, jadi
              garis lurusnya tetap ada. */}
          <div
            className="absolute right-0 top-0 h-full w-full sm:aspect-square sm:w-auto"
            style={{
              maskImage: 'linear-gradient(to right, transparent 0%, #000 48%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 48%)',
            }}
          >
            <img
              aria-hidden
              alt=""
              src="/aqua-banner.gif"
              className={`h-full w-full object-cover ${dark ? 'opacity-70' : 'opacity-45'}`}
              style={{
                maskImage:
                  'linear-gradient(to bottom, transparent 0%, #000 26%, #000 68%, transparent 97%)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0%, #000 26%, #000 68%, transparent 97%)',
              }}
            />
          </div>
          {/* Scrim. Tanpa ini judulnya tenggelam di bagian video yang terang —
              masalah yang baru terlihat setelah dijalankan, bukan dari kode. */}
          <div
            className="absolute inset-0"
            style={{
              background: dark
                ? 'linear-gradient(to right, rgba(16,16,16,0.92) 0%, rgba(16,16,16,0.72) 38%, rgba(16,16,16,0.30) 70%, rgba(16,16,16,0.55) 100%)'
                : 'linear-gradient(to right, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.78) 38%, rgba(255,255,255,0.42) 70%, rgba(255,255,255,0.66) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[100rem] px-6 pb-12 pt-32 sm:px-10 lg:px-16 lg:pb-16">
          <span
            className={`block font-mono text-[10px] uppercase tracking-[0.28em] ${dark ? 'text-[#ffffff]/55' : 'text-[#191919]/55'}`}
          >
            [ Base · 1inch Aqua · SwapVM ]
          </span>

          {/* lg:w-2/3 seperti pada sumbernya — tanpa itu tombolnya terlempar
              jauh ke kanan dan putus hubungannya dengan judul. */}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-8 lg:w-2/3">
            <h1
              className="max-w-2xl text-balance font-display text-[clamp(2.4rem,6.4vw,5rem)] font-medium uppercase leading-[0.94] tracking-[-0.03em]"
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

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onEnter}
                className="inline-flex items-center gap-1.5 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] transition hover:opacity-80"
                style={{
                  backgroundColor: dark ? '#ffffff' : '#191919',
                  color: dark ? '#101010' : '#ffffff',
                }}
              >
                Enter app
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <a
                href="/faucet"
                className={`inline-flex items-center px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] backdrop-blur-sm transition ${
                  dark
                    ? 'border border-[#ffffff]/25 text-[#ffffff]/80 hover:border-[#ffffff]/60 hover:text-[#ffffff]'
                    : 'border border-[#191919]/25 text-[#191919]/80 hover:border-[#191919]/60 hover:text-[#191919]'
                }`}
              >
                Get testnet funds
              </a>
            </div>
          </div>

          <p
            className={`mt-8 max-w-xl text-[15px] font-medium leading-relaxed ${dark ? 'text-[#ffffff]/70' : 'text-[#191919]/70'}`}
          >
            A trading desk built on 1inch Aqua. Market makers keep their tokens in their own
            wallets — Aqua records an allowance, never a deposit — and the pricing rules run
            as SwapVM bytecode instead of a hand-written contract.
          </p>
        </div>

        {/* Padanan logo-cloud pada desain aslinya. Isinya tumpukan yang benar-benar
            kami pakai, bukan logo pihak lain. */}
        <div
          className="relative z-10 border-t"
          style={{ borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(25,25,25,0.10)' }}
        >
          <div className="mx-auto flex w-full max-w-[100rem] flex-wrap items-center gap-x-10 gap-y-3 px-6 py-6 sm:px-10 lg:px-16">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(25,25,25,0.38)' }}
            >
              built on
            </span>
            {STACK_MARKS.map((m) => (
              <span
                key={m}
                className="font-mono text-[11px] uppercase tracking-[0.16em]"
                style={{ color: dark ? 'rgba(255,255,255,0.62)' : 'rgba(25,25,25,0.62)' }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
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
                { label: 'Savings', href: '/savings' },
                { label: 'Portfolio', href: '/portfolio' },
                { label: 'Deposit', href: '/deposit' },
              ]}
            />

            <FooterNav
              dark={dark}
              heading="Wallet"
              links={[
                { label: 'Pay', href: '/pay' },
                { label: 'Payment link', href: '/payment-link' },
                { label: 'Receive', href: '/receive' },
                { label: 'Faucet', href: '/faucet' },
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
