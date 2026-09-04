import type { ReactNode } from 'react'
import { useIsDark } from '../hooks/useTheme'
import { LogoMark } from './Logo'

/**
 * Bento di bawah hero.
 *
 * Isinya dipilih dari yang bisa diperiksa orang lain, bukan janji: properti Aqua
 * yang membuat aplikasi ini mungkin, dua opcode yang benar-benar kami tulis, dan
 * angka yang bisa dihitung ulang dari repo.
 */

function Cell({
  children,
  className = '',
  dark,
}: { children: ReactNode; className?: string; dark: boolean }) {
  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden border p-6 transition-colors sm:p-7 ${className}`}
      style={{
        borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(25,25,25,0.10)',
        backgroundColor: dark ? 'rgba(255,255,255,0.022)' : 'rgba(25,25,25,0.018)',
      }}
    >
      {children}
    </div>
  )
}

function Eyebrow({ children, dark }: { children: ReactNode; dark: boolean }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{ color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(25,25,25,0.45)' }}
    >
      {children}
    </span>
  )
}

function Title({ children, dark, big, code }: { children: ReactNode; dark: boolean; big?: boolean; code?: boolean }) {
  return (
    <h3
      className={`font-display font-medium leading-[1.1] tracking-[-0.02em] ${code ? '' : 'lowercase'} ${
        big ? 'text-[clamp(1.6rem,3.4vw,2.4rem)]' : 'text-[clamp(1.1rem,2vw,1.35rem)]'
      }`}
      style={{ color: dark ? '#f5f5f5' : '#191919' }}
    >
      {children}
    </h3>
  )
}

function Body({ children, dark }: { children: ReactNode; dark: boolean }) {
  return (
    <p
      className="mt-3 text-[13.5px] font-medium leading-relaxed"
      style={{ color: dark ? 'rgba(255,255,255,0.62)' : 'rgba(25,25,25,0.62)' }}
    >
      {children}
    </p>
  )
}

function Figure({ value, label, dark }: { value: string; label: string; dark: boolean }) {
  return (
    <div>
      <div
        className="font-mono text-[clamp(1.6rem,4vw,2.4rem)] leading-none"
        style={{ color: dark ? '#f5f5f5' : '#191919' }}
      >
        {value}
      </div>
      <div
        className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(25,25,25,0.45)' }}
      >
        {label}
      </div>
    </div>
  )
}

interface Module {
  href: string
  name: string
  blurb: string
}

/**
 * Modul yang benar-benar ada di sidebar aplikasi.
 *
 * Daftarnya sengaja menyebut apa yang dilakukan tiap layar, bukan menjualnya —
 * yang berjanji lebih dari yang dikerjakan aplikasinya akan ketahuan dalam satu
 * klik.
 */
const MODULES: Module[] = [
  { href: '/app', name: 'Markets', blurb: 'Live Aqua positions, each one a program you can read.' },
  { href: '/swap', name: 'Swap', blurb: "Trade straight into a maker's wallet. Price comes from the VM." },
  {
    href: '/savings',
    name: 'Savings',
    blurb: 'Put part of your balance to work as liquidity and take 0.3% of every swap through it.',
  },
  { href: '/pay', name: 'Pay', blurb: 'Send any listed token to a plain address.' },
  { href: '/payment-link', name: 'Payment link', blurb: 'One link and a QR that pre-fills the amount for whoever pays.' },
  { href: '/faucet', name: 'Faucet', blurb: 'Mint test tokens so every screen above has something to move.' },
]

function ModuleCell({ dark, href, name, blurb }: Module & { dark: boolean }) {
  return (
    <a
      href={href}
      className="group relative flex flex-col justify-between overflow-hidden border p-6 transition-colors"
      style={{
        borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(25,25,25,0.10)',
        backgroundColor: dark ? 'rgba(255,255,255,0.022)' : 'rgba(25,25,25,0.018)',
      }}
    >
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <Title dark={dark}>{name}</Title>
          <span
            aria-hidden
            className="font-mono text-[13px] transition-transform group-hover:translate-x-0.5"
            style={{ color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(25,25,25,0.45)' }}
          >
            →
          </span>
        </div>
        <Body dark={dark}>{blurb}</Body>
      </div>
    </a>
  )
}

export function BentoGrid({ onEnter }: { onEnter: () => void }) {
  const dark = useIsDark()

  return (
    <section
      className="relative z-10 px-6 py-20 sm:px-10 lg:px-16"
      style={{ backgroundColor: dark ? '#101010' : '#ffffff' }}
    >
      <div className="mx-auto w-full max-w-6xl">
        <Eyebrow dark={dark}>what it actually does</Eyebrow>
        <h2
          className="mt-4 max-w-2xl font-display text-[clamp(1.7rem,4vw,2.8rem)] font-medium lowercase leading-[1.05] tracking-[-0.025em]"
          style={{ color: dark ? '#f5f5f5' : '#191919' }}
        >
          liquidity you can quote without ever handing it over.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* sel utama */}
          <Cell dark={dark} className="sm:col-span-2 lg:col-span-2 lg:row-span-2 min-h-[17rem]">
            <div>
              <Eyebrow dark={dark}>1inch Aqua</Eyebrow>
              <div className="mt-4">
                <Title dark={dark} big>the tokens never leave the maker's wallet.</Title>
              </div>
              <Body dark={dark}>
                Aqua records an allowance, not a deposit. Opening a position moves nothing —
                check the wallet balance before and after, it is identical. Tokens move only
                at the moment a swap settles, and the same capital can back several strategies
                at once.
              </Body>
            </div>
            {/* Dekoratif. Sangat samar supaya tidak melawan teks di atasnya. */}
            <LogoMark className="pointer-events-none absolute -bottom-8 -right-6 h-44 w-44 opacity-[0.06]" />
          </Cell>

          <Cell dark={dark} className="lg:col-span-2">
            <div>
              <Eyebrow dark={dark}>SwapVM</Eyebrow>
              <div className="mt-3">
                <Title dark={dark}>pricing runs as bytecode.</Title>
              </div>
              <Body dark={dark}>
                Strategies are programs, not hand-written contracts. Iqia ships its own router
                with two instructions of its own.
              </Body>
            </div>
          </Cell>

          <Cell dark={dark}>
            <div>
              <Eyebrow dark={dark}>opcode 22</Eyebrow>
              <div className="mt-3">
                <Title dark={dark} code>ExclusiveFill</Title>
              </div>
              <Body dark={dark}>
                Only the named taker may fill. Makers quote tighter when they know who is on the
                other side.
              </Body>
            </div>
          </Cell>

          <Cell dark={dark}>
            <div>
              <Eyebrow dark={dark}>opcode 23</Eyebrow>
              <div className="mt-3">
                <Title dark={dark} code>SolvencyGuard</Title>
              </div>
              <Body dark={dark}>
                Reads the maker's real balance and moves the price as it thins — degrading
                instead of reverting.
              </Body>
            </div>
          </Cell>

          {/* angka */}
          <Cell dark={dark} className="sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap items-end justify-between gap-8">
              <Figure value="0" label="tokens held by any contract" dark={dark} />
              <Figure value="2" label="custom SwapVM opcodes" dark={dark} />
              <Figure value="34" label="solidity tests" dark={dark} />
              <Figure value="x·y=k" label="priced inside the VM" dark={dark} />
            </div>
          </Cell>

          {/* ajakan */}
          <Cell dark={dark} className="justify-between">
            <div>
              <Eyebrow dark={dark}>live</Eyebrow>
              <div className="mt-3">
                <Title dark={dark}>see the markets.</Title>
              </div>
            </div>
            <button
              onClick={onEnter}
              className="mt-6 inline-flex w-full items-center justify-between px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] transition hover:opacity-80"
              style={{
                backgroundColor: dark ? '#ffffff' : '#191919',
                color: dark ? '#101010' : '#ffffff',
              }}
            >
              Open app <span aria-hidden>→</span>
            </button>
          </Cell>
        </div>

        <div className="mt-16">
          <Eyebrow dark={dark}>what you can open</Eyebrow>
          <h2
            className="mt-4 max-w-2xl font-display text-[clamp(1.4rem,3vw,2.1rem)] font-medium lowercase leading-[1.05] tracking-[-0.025em]"
            style={{ color: dark ? '#f5f5f5' : '#191919' }}
          >
            every screen settles against the same registry.
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <ModuleCell key={m.href} dark={dark} {...m} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default BentoGrid
