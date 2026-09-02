import type { ReactNode } from 'react'
import ScrollStack, { ScrollStackItem } from './ScrollStack'
import { BentoSection, SystemArchitecture, SwapAmmMechanism } from './StorySections'
import asset1 from '../../assets/assets-01.webp'
import asset2 from '../../assets/assets-02.webp'
import asset3 from '../../assets/assets-03.webp'
import asset4 from '../../assets/assets-04.webp'
import { useIsDark } from '../hooks/useTheme'

// Light-speck film grain for the dark ground (white noise, low alpha) — matches
// the hero's grain so the whole dark landing reads as one surface.
const GRAIN = ''

/** The narrative beats, presented as a ScrollStack: each card pins near the
 *  top and scales/stacks under the next as you scroll. `flip` puts the loop on
 *  the left. */
const STACK = [
  {
    n: '01',
    label: 'public ledger',
    coord: '[ every block · forever ]',
    title: 'public chains remember everything.',
    body: 'every block on an open chain is permanent, public and linkable amounts, balances, counterparties, readable by anyone with the address, forever. the ledger never forgets.',
    src: asset1,
    poster: asset1,
    flip: false,
  },
  {
    n: '02',
    label: 'amm swap',
    coord: '[ x * y = k · midpoint ]',
    title: 'constant product & blind matching.',
    body: 'swaps run on a constant product formula (x * y = k) combined with shielded matching. orders are submitted as cryptographic commitments, matched blind off-chain at the midpoint reference price, and settled publicly on-chain without exposing user identities or trade paths.',
    src: asset2,
    poster: asset2,
    flip: true,
  },
  {
    n: '03',
    label: 'shielded pool',
    coord: '[ Poseidon2 · Merkle ]',
    title: 'the shielded layer forgets.',
    body: 'bridge in and your balance becomes a Poseidon2 commitment a note in a Merkle tree. amount and owner stay inside the hash; only the root is ever public, and old notes never link to new.',
    src: asset3,
    poster: asset3,
    flip: false,
  },
  {
    n: '04',
    label: 'proven math',
    coord: '[ UltraHonk · BN254 ]',
    title: 'the math is the lock.',
    body: 'every move out is a zero-knowledge proof, checked on-chain inside a Flare EVM contract. a spend reveals only a nullifier, so the old note and the new never link. no valid proof, no funds move.',
    src: asset4,
    poster: asset4,
    flip: true,
  },
]

const MODULES = [
  { k: 'DEPOSIT / WITHDRAW', d: 'assets in, or in from Ethereum, BLS-verified on Flare EVM.', to: '/deposit' },
  { k: 'PORTFOLIO', d: 'private multi-asset balances only you can see.', to: '/portfolio' },
  { k: 'PAY', d: 'confidential payments; amounts and parties hidden.', to: '/pay' },
  { k: 'SWAP', d: 'a zero-knowledge dark pool; orders matched blind.', to: '/swap' },
]


function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] ${className}`}>
      {children}
    </div>
  )
}

export function StoryShielded({ onEnter }: { onEnter: () => void }) {
  const dark = useIsDark()
  const cardBg = { background: dark ? 'rgba(242,242,242,0.04)' : 'rgba(25,25,25,0.03)' }

  return (
    <section
      className="relative w-full overflow-hidden px-6 py-32 sm:px-8 md:py-40 transition-colors duration-300"
      style={{
        backgroundColor: dark ? '#101010' : '#f2f2f2',
        color: dark ? '#c4c4c4' : '#555555',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: GRAIN,
          backgroundSize: '90px 90px',
          maskImage: 'linear-gradient(to bottom, transparent, #000 16rem)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 16rem)',
          opacity: dark ? 0.5 : 0.2,
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* intro */}
        <Label>
          <span className="text-[#191919]/80 dark:text-[#d6d6d6]">public ledger</span>
          <span aria-hidden className="text-[#7a7a7a] dark:text-[#a6a6a6]">→</span>
          <span className="text-[#191919]/80 dark:text-[#d6d6d6]">shielded layer</span>
        </Label>
        <h2
          className="mt-8 max-w-3xl font-display font-medium lowercase leading-[1.04] tracking-[-0.03em] text-[#191919] dark:text-[#f5f5f5]"
          style={{ fontSize: 'clamp(2rem, 5.4vw, 3.6rem)' }}
        >
          public chains remember everything.{' '}
          <span className="text-[#555555] dark:text-[#c4c4c4]">the shielded layer forgets.</span>
        </h2>

        {/* Three narrative beats as a pinned, scaling card stack (React Bits
            ScrollStack). Window-scroll mode — its Lenis also drives the page. */}
        <div className="mt-14 md:mt-16">
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
                itemClassName={`flex min-h-[60vh] items-center rounded-none border px-6 py-8 sm:px-12 sm:py-10 transition-colors duration-300 hover:border-red-500 ${
                  dark
                    ? 'border-[#f2f2f2]/10 bg-[#1c1c1c] shadow-[0_30px_80px_-32px_rgba(0,0,0,0.6)]'
                    : 'border-[#191919]/10 bg-[#f7f7f7] shadow-[0_30px_80px_-32px_rgba(25,25,25,0.15)]'
                }`}
              >
                <div className="grid w-full grid-cols-1 items-center gap-x-12 gap-y-8 md:grid-cols-2">
                  <div className={`mx-auto w-[clamp(180px,28vw,320px)] overflow-hidden rounded-none border border-spectral/10 ${s.flip ? 'md:order-1' : 'md:order-2'}`}>
                    <img src={s.src} alt="" className="block w-full h-auto object-cover" />
                  </div>
                  <div className={`max-w-md ${s.flip ? 'md:order-2' : 'md:order-1'}`}>
                    <Label>
                      <span className="text-[#191919] dark:text-[#d6d6d6]">{s.n} · {s.label}</span>
                      <span className="text-[#7a7a7a] dark:text-[#8a8a8a]">{s.coord}</span>
                    </Label>
                    <h3 className="mt-5 font-display text-[clamp(1.6rem,3.4vw,2.4rem)] font-medium lowercase leading-[1.05] tracking-[-0.02em] text-[#191919] dark:text-[#f5f5f5]">
                      {s.title}
                    </h3>
                    <p className="mt-5 text-[15px] font-medium leading-relaxed text-[#555555] dark:text-[#c4c4c4]">{s.body}</p>
                  </div>
                </div>
              </ScrollStackItem>
            ))}
          </ScrollStack>
        </div>

        {/* bento — the platform at a glance, below the three story beats */}
        <BentoSection />

        {/* system architecture — L1 lock → on-chain verify → shielded settle */}
        <SystemArchitecture />

        {/* swap & amm mechanism — commitment → midpoint match → ZK-settlement */}
        <SwapAmmMechanism />

        {/* modules + CTA — one card */}
        <div className={`relative border px-6 py-10 sm:px-10 sm:py-12 ${dark ? 'border-[#f2f2f2]/10' : 'border-[#191919]/10'}`} style={cardBg}>
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-[#191919]/12 dark:border-[#f2f2f2]/12 bg-[#191919]/12 dark:bg-[#f2f2f2]/12 sm:grid-cols-4">
            {MODULES.map((m) => (
              <a
                key={m.k}
                href={`#${m.to}`}
                className={`group block px-5 py-7 transition ${
                  dark
                    ? 'bg-[#1c1c1c] hover:bg-[#242424]'
                    : 'bg-[#f7f7f7] hover:bg-[#e8e8e8]'
                }`}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#191919] dark:text-[#d6d6d6]">{m.k}</div>
                <p className="mt-3 text-[13px] leading-relaxed text-[#555555] dark:text-[#c4c4c4]">{m.d}</p>
                <span className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a7a7a] transition-colors group-hover:text-[#6b6b6b] dark:text-[#858585] dark:group-hover:text-[#bfbfbf]">
                  open →
                </span>
              </a>
            ))}
          </div>
          <button
            onClick={onEnter}
            className="mt-10 font-mono text-[12px] uppercase tracking-[0.18em] text-[#7a7a7a] transition hover:text-[#6b6b6b] dark:text-[#858585] dark:hover:text-[#bfbfbf]"
          >
            enter the shielded layer →
          </button>
        </div>
      </div>
    </section>
  )
}
