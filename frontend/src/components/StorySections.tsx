import type { ReactNode } from 'react'
import { useIsDark } from '../hooks/useTheme'

/* Shared cream-section tokens (match StoryShielded): ink #f5f5f5, body #c4c4c4,
   labels #d6d6d6 / #8a8a8a / #858585, gold #bfbfbf / #a6a6a6, card border
   #f2f2f2/10, card bg rgba(242,242,242,0.045). */

function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] ${className}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- BENTO

function Tile({ className = '', children }: { className?: string; children: ReactNode }) {
  const dark = useIsDark()
  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden border border-[#191919]/10 dark:border-[#f2f2f2]/10 p-6 transition-colors duration-300 hover:border-red-500 dark:hover:border-red-500 ${className}`}
      style={{ background: dark ? 'rgba(242,242,242,0.045)' : 'rgba(25,25,25,0.03)' }}
    >
      {children}
    </div>
  )
}

function TileHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#191919]/80 dark:text-[#d6d6d6]">{eyebrow}</span>
      <h4 className="mt-3 font-display text-[clamp(1.25rem,2.4vw,1.7rem)] font-medium lowercase leading-[1.08] tracking-[-0.02em] text-[#191919] dark:text-[#f5f5f5]">
        {title}
      </h4>
    </div>
  )
}

function Stat({ value, sup, label }: { value: string; sup?: string; label: string }) {
  return (
    <>
      <div className="flex items-start gap-1">
        <span className="font-display text-[clamp(2.6rem,6vw,3.4rem)] font-medium leading-[0.9] tracking-[-0.03em] text-[#191919] dark:text-[#f5f5f5]">
          {value}
        </span>
        {sup && <span className="mt-1 font-mono text-[12px] text-[#7a7a7a] dark:text-[#a6a6a6]">{sup}</span>}
      </div>
      <span className="mt-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-[#7a7a7a] dark:text-[#858585]">{label}</span>
    </>
  )
}

export function BentoSection() {
  const dark = useIsDark()
  return (
    <div className="mt-8">
      <Label>
        <span className="text-[#191919]/80 dark:text-[#d6d6d6]">the platform</span>
        <span className="text-[#7a7a7a] dark:text-[#8a8a8a]">[ one shielded layer · four surfaces ]</span>
      </Label>
      <h3 className="mt-6 max-w-2xl font-display text-[clamp(1.6rem,3.6vw,2.6rem)] font-medium lowercase leading-[1.04] tracking-[-0.02em] text-[#191919] dark:text-[#f5f5f5]">
        privacy, proven, not promised.
      </h3>

      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {/* big feature — commitment note */}
        <Tile className="sm:col-span-2 md:col-span-2 md:row-span-2">
          <TileHead eyebrow="01 · commitment note" title="your balance is a hash, not an account." />
          <p className="mt-4 max-w-sm text-[14px] font-medium leading-relaxed text-[#555555] dark:text-[#c4c4c4]">
            every deposit becomes a Poseidon2 commitment in an append-only Merkle tree. amount and
            owner live inside the hash, only the root is ever public, and old notes never link to new
            ones.
          </p>
          <code className="mt-6 block w-fit rounded-none px-3 py-2 font-mono text-[11px] text-[#7a7a7a] dark:text-[#bfbfbf]" style={{ background: dark ? 'rgba(242,242,242,0.06)' : 'rgba(25,25,25,0.05)' }}>
            commitment = hash4(asset, amount, owner, blinding)
          </code>
        </Tile>

        {/* ultrahonk */}
        <Tile className="sm:col-span-2 md:col-span-2">
          <TileHead eyebrow="02 · ultrahonk" title="proofs, not disclosures." />
          <p className="mt-3 text-[13.5px] font-medium leading-relaxed text-[#555555] dark:text-[#c4c4c4]">
            each exit is a Noir/UltraHonk zero-knowledge proof, checked inside a Flare EVM contract over
            BN254. no amounts, no addresses leave the circuit.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a] dark:text-[#858585]">
            <span className="rounded-none px-2.5 py-1 text-[#7a7a7a] dark:text-[#bfbfbf]" style={{ background: dark ? 'rgba(242,242,242,0.06)' : 'rgba(25,25,25,0.05)' }}>14,592 B proof</span>
            <span className="rounded-none px-2.5 py-1 text-[#7a7a7a] dark:text-[#bfbfbf]" style={{ background: dark ? 'rgba(242,242,242,0.06)' : 'rgba(25,25,25,0.05)' }}>1,760 B vk</span>
            <span className="rounded-none px-2.5 py-1" style={{ background: dark ? 'rgba(242,242,242,0.06)' : 'rgba(25,25,25,0.05)' }}>keccak transcript</span>
          </div>
        </Tile>

        {/* stat: merkle depth */}
        <Tile>
          <Stat value="20" label="merkle depth · 2²⁰ private leaves" />
        </Tile>

        {/* stat: circuits */}
        <Tile>
          <Stat value="5" label="Noir circuits · one verifier each" />
        </Tile>

        {/* bridge */}
        <Tile className="sm:col-span-2 md:col-span-2">
          <TileHead eyebrow="03 · trust-minimized bridge" title="bridged, not wrapped." />
          <p className="mt-3 text-[13.5px] font-medium leading-relaxed text-[#555555] dark:text-[#c4c4c4]">
            assets locked on Ethereum arrive as shielded notes an Ethereum sync-committee BLS
            signature is verified <span className="text-[#7a7a7a] dark:text-[#bfbfbf]">natively on Flare EVM</span>, no
            trusted relayer, no SNARK wrap.
          </p>
        </Tile>

        {/* dark pool */}
        <Tile className="sm:col-span-2 md:col-span-2">
          <TileHead eyebrow="04 · dark pool" title="matched blind." />
          <p className="mt-3 text-[13.5px] font-medium leading-relaxed text-[#555555] dark:text-[#c4c4c4]">
            orders are placed and matched at the midpoint without revealing size or side, then settled
            atomically a zero-knowledge DEX where the book itself stays hidden.
          </p>
        </Tile>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- ARCHITECTURE

function Layer({
  eyebrow,
  title,
  items,
  highlight = false,
}: {
  eyebrow: string
  title: string
  items: string[]
  highlight?: boolean
}) {
  const dark = useIsDark()
  return (
    <div
      className={`border px-5 py-4 ${highlight ? 'border-[#bfbfbf]/30 dark:border-[#bfbfbf]/30' : 'border-[#191919]/12 dark:border-[#f2f2f2]/12'}`}
      style={{
        background: highlight
          ? (dark ? 'rgba(185,185,185,0.1)' : 'rgba(122,122,122,0.1)')
          : (dark ? '#1c1c1c' : '#f7f7f7'),
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#191919]/80 dark:text-[#d6d6d6]">{eyebrow}</span>
        <span className="font-display text-[15px] font-medium lowercase tracking-[-0.01em] text-[#191919] dark:text-[#f5f5f5]">{title}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it}
            className="rounded-none px-2 py-1 font-mono text-[10px] tracking-[0.03em] text-[#555555] dark:text-[#c4c4c4]"
            style={{ background: dark ? 'rgba(242,242,242,0.06)' : 'rgba(25,25,25,0.05)' }}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  )
}

function Connector({ note }: { note: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5 pl-5">
      <span aria-hidden className="text-[13px] leading-none text-[#7a7a7a] dark:text-[#a6a6a6]">↓</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#7a7a7a] dark:text-[#858585]">{note}</span>
    </div>
  )
}

function RailCard({ title, lines }: { title: string; lines: string[] }) {
  const dark = useIsDark()
  return (
    <div
      className="border border-dashed border-[#191919]/20 dark:border-[#f2f2f2]/20 px-4 py-3"
      style={{ background: dark ? '#1c1c1c' : '#f7f7f7' }}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#191919]/80 dark:text-[#d6d6d6]">{title}</div>
      {lines.map((l) => (
        <p key={l} className="mt-1 font-mono text-[10px] leading-relaxed text-[#7a7a7a] dark:text-[#858585]">
          {l}
        </p>
      ))}
    </div>
  )
}

export function SystemArchitecture() {
  const dark = useIsDark()
  return (
    <div
      className="mt-8 border border-[#191919]/10 dark:border-[#f2f2f2]/10 px-6 py-10 sm:px-10 sm:py-12"
      style={{ background: dark ? 'rgba(242,242,242,0.045)' : 'rgba(25,25,25,0.03)' }}
    >
      <Label>
        <span className="text-[#191919]/80 dark:text-[#d6d6d6]">system architecture</span>
        <span className="text-[#7a7a7a] dark:text-[#8a8a8a]">[ L1 lock → on-chain verify → shielded settle ]</span>
      </Label>
      <h3 className="mt-6 max-w-2xl font-display text-[clamp(1.5rem,3.2vw,2.2rem)] font-medium lowercase leading-[1.06] tracking-[-0.02em] text-[#191919] dark:text-[#f5f5f5]">
        every value crosses one boundary, and it's checked on-chain.
      </h3>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_16rem]">
        {/* main vertical flow */}
        <div className="flex flex-col">
          <Layer
            eyebrow="L1 · Ethereum Sepolia"
            title="LarelBridge"
            items={['lock ETH / USDC', 'emit Locked(commitment)']}
          />
          <Connector note="untrusted relayer — transports data, holds no authority" />
          <Layer
            eyebrow="Flare EVM · verification"
            title="EthLightClient → LarelBridge"
            items={['BLS12-381 sync-committee', 'MPT storage proof vs state_root', 'bridge_in → mint note']}
          />
          <Connector note="native BN254 / BLS — no SNARK wrap" />
          <Layer
            eyebrow="Flare EVM · shielded state"
            title="LarelPool"
            items={['Poseidon2 commitment notes', 'append-only Merkle · depth 20', 'nullifier set · 100-root ring']}
            highlight
          />
          <Connector note="every exit gated by a zero-knowledge proof" />
          <Layer
            eyebrow="Flare EVM · UltraHonk verifiers"
            title="5 circuits · one contract each"
            items={['withdraw', 'transfer', 'place_order', 'match_orders', 'cancel_order']}
          />
        </div>

        {/* off-chain rail */}
        <aside className="flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a7a7a] dark:text-[#8a8a8a]">off-chain · no authority</span>
          <RailCard title="SDK" lines={['notes · Merkle · Poseidon2', 'UltraHonk proofs (bb.js)', 'Flare EVM tx building']} />
          <RailCard title="Matcher" lines={['off-chain price-time', 'mirrors match_orders', 're-proven on-chain']} />
          <RailCard title="Relayer" lines={['beacon finality updates', 'eth_getProof', 'every value re-verified']} />
        </aside>
      </div>
    </div>
  )
}

export function SwapAmmMechanism() {
  const dark = useIsDark()
  return (
    <div
      className="mt-8 border border-[#191919]/10 dark:border-[#f2f2f2]/10 px-6 py-10 sm:px-10 sm:py-12"
      style={{ background: dark ? 'rgba(242,242,242,0.045)' : 'rgba(25,25,25,0.03)' }}
    >
      <Label>
        <span className="text-[#191919]/80 dark:text-[#d6d6d6]">swap & amm mechanism</span>
        <span className="text-[#7a7a7a] dark:text-[#8a8a8a]">[ commitment → midpoint match → ZK-settlement ]</span>
      </Label>
      <h3 className="mt-6 max-w-2xl font-display text-[clamp(1.5rem,3.2vw,2.2rem)] font-medium lowercase leading-[1.06] tracking-[-0.02em] text-[#191919] dark:text-[#f5f5f5]">
        how dark swaps work: from commitment to constant product settlement.
      </h3>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_16rem]">
        {/* main vertical flow */}
        <div className="flex flex-col">
          <Layer
            eyebrow="Phase 1 · Client Commitment"
            title="SDK / Zero-Knowledge Circuit"
            items={['shielded input notes locked', 'generate place_order proof', 'order commitment emitted']}
          />
          <Connector note="sealed commitments sent to matcher — size and price hidden" />
          <Layer
            eyebrow="Phase 2 · Midpoint Matching"
            title="Off-Chain Matcher Engine"
            items={['live reference price queried', 'match bids & asks at midpoint', 'calculate constant product (x * y = k)']}
          />
          <Connector note="generates blind execution path and ZK match proof" />
          <Layer
            eyebrow="Phase 3 · On-Chain Settlement"
            title="Flare EVM Contract (match_orders)"
            items={['verify ZK proof of matching', 'nullify spent input notes', 'append output notes to Merkle tree']}
            highlight
          />
        </div>

        {/* Technical specs panel */}
        <aside className="flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a7a7a] dark:text-[#8a8a8a]">AMM Specifications</span>
          <RailCard title="Constant Product" lines={['x * y = k formula', 'maintains pool invariant', 'slippage computed blind']} />
          <RailCard title="Anti-Frontrunning" lines={['matched at fair midpoint', 'no public mempool visibility', 'sandwiches are impossible']} />
          <RailCard title="ZK Privacy" lines={['notes nullified privately', 'only roots are updated', 'unlinkable asset paths']} />
        </aside>
      </div>
    </div>
  )
}
