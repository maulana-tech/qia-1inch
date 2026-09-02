import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import ScrambleCycle from './ScrambleCycle'
import { StoryShielded } from './StoryShielded'

import iqiaLogo from '../assets/iqia-logo.png'
import { ThemeToggle } from './ThemeToggle'
import { useIsDark } from '../hooks/useTheme'

const ROTATING = ['shielded', 'unlinkable', 'verified', 'private', 'yours']


const NET_TITLE = ['Testnet']
const NET_VALUE = ['Flare · Coston2']
const PROOF_TITLE = ['Proof']
const PROOF_VALUE = ['UltraHonk · BN254']
const SHIELD_TITLE = ['Shielded']
const SHIELD_VALUE = ['Poseidon2 · Merkle']

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
          <a href="/" className="flex items-center gap-3">
            <img src={iqiaLogo} alt="Iqia" className="h-12 w-auto" />
            <span className={`font-display text-base font-semibold tracking-tight ${dark ? 'text-[#ffffff]' : 'text-[#191919]'}`}>
              iqia
            </span>
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
              [ Flare · Compute Extension · zero-knowledge ]
            </span>

            <h1
              className="mt-7 font-display font-medium uppercase leading-[0.98] tracking-[-0.04em]"
              style={{
                fontSize: 'clamp(2.4rem, 6.2vw, 5.25rem)',
                color: dark ? '#fafafa' : '#191919',
              }}
            >
              <span className="flex flex-wrap gap-x-[0.26em]">
                <Word>private</Word>
                <Word>your</Word>
                <Word>assets</Word>
              </span>
              <span className="flex flex-wrap gap-x-[0.26em]">
                <Word>that</Word>
                <Word>stay</Word>
              </span>
              <span className="block">
                <ScrambleCycle words={ROTATING} duration={900} hold={2000} />
              </span>
            </h1>

            <p
              className={`mt-8 max-w-xl text-[15px] font-medium leading-relaxed ${dark ? 'text-[#ffffff]/70' : 'text-[#191919]/70'}`}
            >
              Deposit, transfer and trade on Flare with amounts, balances and counterparties
              hidden — every move still verified on-chain by a zero-knowledge proof.
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

      <StoryShielded onEnter={onEnter} />

      <footer className="relative flex min-h-screen flex-col justify-between overflow-hidden px-8 py-16 transition-colors duration-300"
              style={{
                backgroundColor: dark ? '#101010' : '#ffffff',
                color: dark ? '#ffffff' : '#191919',
              }}
      >


        <div className="relative flex items-start justify-between">
          <a href="/" className="transition hover:opacity-75">
            <img src={iqiaLogo} alt="Iqia" className="h-10 w-auto opacity-85" />
          </a>
        </div>

        <style>{`
          @keyframes lax-marquee {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-50%, 0, 0); }
          }
          .animate-lax-marquee {
            display: inline-block;
            white-space: nowrap;
            animation: lax-marquee 20s linear infinite;
          }
        `}</style>

        <div className="relative overflow-hidden w-full whitespace-nowrap select-none">
          <div className="animate-lax-marquee" style={{ fontSize: 'clamp(2rem, 8.2vw, 6.5rem)', color: dark ? '#a6a6a6' : '#7a7a7a' }}>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>IQIA</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>FLARE</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>FCE</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>NOIR</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>SHIELDED</a>
            <span className="mx-8 opacity-45">·</span>
            {/* Duplicate for infinite loop */}
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>IQIA</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>FLARE</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>FCE</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>NOIR</a>
            <span className="mx-8 opacity-45">·</span>
            <a href="/" className={`transition-colors ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>SHIELDED</a>
            <span className="mx-8 opacity-45">·</span>
          </div>
          <div className="mt-6 h-px w-full" style={{ backgroundColor: dark ? 'rgba(255,255,255,0.2)' : 'rgba(25,25,25,0.2)' }} />
        </div>

        <div className="relative">
          <div className="flex flex-col gap-12 md:flex-row md:items-end md:justify-between">
            <nav className={`flex gap-6 font-mono text-[13px] uppercase tracking-[0.14em] ${dark ? 'text-[#ffffff]/70' : 'text-[#191919]/70'}`}>
              <a href="https://github.com/maulana-tech/iqia-main.git" className={`transition ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}>GitHub</a>
            </nav>

            <div className="flex justify-end">
              <div className="max-w-[20rem] text-right">
                <div className={`mb-4 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.16em] justify-end ${dark ? 'text-[#ffffff]' : 'text-[#191919]'}`}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <circle cx="5" cy="6.5" r="4.5" stroke="currentColor" />
                    <circle cx="8" cy="6.5" r="4.5" stroke="currentColor" />
                  </svg>
                  Build on Flare
                </div>
                <p className={`text-[13px] leading-relaxed ${dark ? 'text-[#ffffff]/70' : 'text-[#191919]/70'}`}>
                  Iqia is a application-run project. We're always developing for everyone in the Flare ecosystem.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-14 flex items-center justify-between border-t pt-6 font-mono text-[11px] uppercase tracking-[0.14em]"
               style={{
                 borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(25,25,25,0.12)',
                 color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(25,25,25,0.5)',
               }}
          >
            <span>© Iqia Team 2026</span>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className={`transition ${dark ? 'hover:text-[#ffffff]' : 'hover:text-[#191919]'}`}
            >
              Top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
