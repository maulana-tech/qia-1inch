import type { ReactNode } from 'react'
import ScrollStack, { ScrollStackItem } from './ScrollStack'
import { useIsDark } from '../hooks/useTheme'

/**
 * Empat kartu bertumpuk yang menjelaskan mekanismenya.
 *
 * Figurnya SVG, bukan gambar. Yang lama empat webp dekoratif warisan aplikasi
 * asal: berat, tidak menjelaskan apa-apa, dan warnanya tertanam sehingga selalu
 * salah di salah satu tema. Yang ini menggambar mekanisme yang sedang dibahas
 * kartunya, dan mewarisi `currentColor`.
 */

const S = { stroke: 'currentColor', strokeWidth: 1.25, fill: 'none' } as const

/** Model lama: modal harus diserahkan ke kolam sebelum boleh mengutip harga. */
function FigureCustody() {
  return (
    <svg viewBox="0 0 200 140" className="w-full" aria-hidden>
      <rect x="8" y="46" width="52" height="48" rx="3" {...S} />
      <text x="34" y="74" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.75">wallet</text>
      <path d="M64 70h52" {...S} />
      <path d="M110 65l6 5-6 5" {...S} />
      <rect x="120" y="38" width="64" height="64" rx="3" {...S} />
      <path d="M138 62v-6a14 14 0 0 1 28 0v6" {...S} />
      <rect x="134" y="62" width="36" height="26" rx="2" {...S} />
      <text x="152" y="112" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.75">pool</text>
    </svg>
  )
}

/** Aqua: yang berpindah cuma catatan izin. Token tetap di tempatnya. */
function FigureAllowance() {
  return (
    <svg viewBox="0 0 200 140" className="w-full" aria-hidden>
      <rect x="8" y="46" width="52" height="48" rx="3" {...S} />
      <text x="34" y="74" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.75">wallet</text>
      <circle cx="34" cy="88" r="2.5" fill="currentColor" />
      <circle cx="42" cy="88" r="2.5" fill="currentColor" />
      <circle cx="50" cy="88" r="2.5" fill="currentColor" />
      <path d="M64 62h52" {...S} strokeDasharray="4 4" />
      <text x="90" y="54" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.6">allowance</text>
      <rect x="120" y="38" width="64" height="48" rx="3" {...S} strokeDasharray="4 4" />
      <text x="152" y="66" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.75">aqua</text>
      <text x="152" y="102" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.5">holds nothing</text>
    </svg>
  )
}

/** SwapVM: aturan harga sebagai deretan instruksi. */
function FigureBytecode() {
  const cells = [
    { x: 10, w: 34, label: '22' },
    { x: 48, w: 34, label: '23' },
    { x: 86, w: 34, label: '21' },
    { x: 124, w: 30, label: '17' },
    { x: 158, w: 30, label: '20' },
  ]
  return (
    <svg viewBox="0 0 200 140" className="w-full" aria-hidden>
      <text x="10" y="46" fontSize="8" fill="currentColor" opacity="0.6">program</text>
      {cells.map((c, i) => (
        <g key={c.label}>
          <rect x={c.x} y={54} width={c.w} height={30} rx={2} {...S} opacity={i < 2 ? 1 : 0.45} />
          <text x={c.x + c.w / 2} y={73} textAnchor="middle" fontSize="10" fill="currentColor" opacity={i < 2 ? 0.9 : 0.5}>
            {c.label}
          </text>
        </g>
      ))}
      <path d="M10 96h72" {...S} />
      <text x="10" y="112" fontSize="8" fill="currentColor" opacity="0.6">two opcodes are ours</text>
    </svg>
  )
}

/** Kolam terlindung: keluar hanya lewat bukti. */
function FigureBand() {
  return (
    <svg viewBox="0 0 200 140" className="w-full" aria-hidden>
      {/* kurva rentang penuh, tipis dan melebar */}
      <path d="M24 108C60 108 74 40 176 34" {...S} opacity="0.35" />
      {/* pita tempat likuiditas dipusatkan */}
      <path d="M78 26v92M126 26v92" {...S} opacity="0.5" strokeDasharray="3 4" />
      <path d="M78 84C92 84 96 56 126 52" {...S} />
      <circle cx="102" cy="66" r="4" {...S} />
      <text x="102" y="132" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.6">
        the same capital, inside a chosen band
      </text>
    </svg>
  )
}

const STACK: {
  n: string
  label: string
  coord: string
  title: string
  body: string
  figure: ReactNode
  flip: boolean
}[] = [
  {
    n: '01',
    label: 'the usual price',
    coord: '[ deposit first · quote later ]',
    title: 'quoting normally costs you custody.',
    body: 'to make a market on-chain you hand your tokens to a pool contract first. the capital is locked there, it cannot back anything else, and taking it back is its own transaction. that is the toll every AMM charges before you have earned a single fee.',
    figure: <FigureCustody />,
    flip: false,
  },
  {
    n: '02',
    label: '1inch aqua',
    coord: '[ allowance · not deposit ]',
    title: 'the tokens never move in.',
    body: 'aqua records an allowance instead of taking a deposit. opening a position transfers nothing — compare the wallet balance before and after, it is identical. tokens move once, at the moment a swap settles, straight from the maker to the taker. the same capital can back several strategies at the same time.',
    figure: <FigureAllowance />,
    flip: true,
  },
  {
    n: '03',
    label: 'swapvm',
    coord: '[ opcode 22 · opcode 23 ]',
    title: 'the strategy is a program.',
    body: 'pricing rules run as bytecode inside a virtual machine, not as a hand-written contract. iqia ships its own router with two instructions of its own: one restricts who may fill an order, the other moves the price as the maker’s real backing thins — degrading instead of reverting.',
    figure: <FigureBytecode />,
    flip: false,
  },
  {
    n: '04',
    label: 'strategies',
    coord: '[ pick one · ship it ]',
    title: 'four programs, one wizard.',
    body: 'the same balance can quote across the whole range, concentrate into a price band, decay its quote after a move so arbitrage takes less, or answer to a single named filler. each is a different bytecode program, and the last step of the wizard shows you the bytes before you send them.',
    figure: <FigureBand />,
    flip: true,
  },
]

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 font-mono text-[10px] uppercase tracking-[0.18em]">
      {children}
    </div>
  )
}

export function StoryStack() {
  const dark = useIsDark()

  return (
    <section
      className="relative z-10 px-6 py-16 sm:px-10 lg:px-16"
      style={{ backgroundColor: dark ? '#101010' : '#ffffff' }}
    >
      <div className="mx-auto w-full max-w-6xl">
        <ScrollStack
          useWindowScroll
          itemDistance={280}
          itemStackDistance={44}
          stackPosition="14%"
          scaleEndPosition="6%"
          baseScale={0.88}
          itemScale={0.04}
          blurAmount={0}
        >
          {STACK.map((s) => (
            <ScrollStackItem
              key={s.n}
              itemClassName={`flex min-h-[58vh] items-center rounded-2xl border px-6 py-8 transition-colors duration-300 sm:px-12 sm:py-10 ${
                dark
                  ? 'border-[#f2f2f2]/10 bg-[#1c1c1c] shadow-[0_30px_80px_-32px_rgba(0,0,0,0.6)]'
                  : 'border-[#191919]/10 bg-[#f7f7f7] shadow-[0_30px_80px_-32px_rgba(25,25,25,0.15)]'
              }`}
            >
              <div className="grid w-full grid-cols-1 items-center gap-x-12 gap-y-8 md:grid-cols-2">
                <div
                  className={`mx-auto w-[clamp(200px,30vw,340px)] ${s.flip ? 'md:order-1' : 'md:order-2'}`}
                  style={{ color: dark ? 'rgba(255,255,255,0.72)' : 'rgba(25,25,25,0.72)' }}
                >
                  {s.figure}
                </div>
                <div className={`max-w-md ${s.flip ? 'md:order-2' : 'md:order-1'}`}>
                  <Label>
                    <span style={{ color: dark ? '#d6d6d6' : '#191919' }}>
                      {s.n} · {s.label}
                    </span>
                    <span style={{ color: dark ? '#8a8a8a' : '#7a7a7a' }}>{s.coord}</span>
                  </Label>
                  <h3
                    className="mt-5 font-display text-[clamp(1.6rem,3.4vw,2.4rem)] font-medium lowercase leading-[1.05] tracking-[-0.02em]"
                    style={{ color: dark ? '#f5f5f5' : '#191919' }}
                  >
                    {s.title}
                  </h3>
                  <p
                    className="mt-5 text-[15px] font-medium leading-relaxed"
                    style={{ color: dark ? '#c4c4c4' : '#555555' }}
                  >
                    {s.body}
                  </p>
                </div>
              </div>
            </ScrollStackItem>
          ))}
        </ScrollStack>
      </div>
    </section>
  )
}

export default StoryStack
