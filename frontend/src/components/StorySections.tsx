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
        <span className="text-[#7a7a7a] dark:text-[#8a8a8a]">[ wallet → SwapVM → Aqua → maker wallet ]</span>
      </Label>
      <h3 className="mt-6 max-w-2xl font-display text-[clamp(1.5rem,3.2vw,2.2rem)] font-medium lowercase leading-[1.06] tracking-[-0.02em] text-[#191919] dark:text-[#f5f5f5]">
        no contract ever holds the liquidity it quotes.
      </h3>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_16rem]">
        {/* main vertical flow */}
        <div className="flex flex-col">
          <Layer
            eyebrow="maker · own wallet"
            title="ship() to Aqua"
            items={['approve once, deposit never', 'virtual balance recorded', 'tokens stay put']}
          />
          <Connector note="no token moves — ship() is bookkeeping only" />
          <Layer
            eyebrow="Base EVM · execution"
            title="IqiaSwapVMRouter"
            items={['runs the strategy bytecode', 'ExclusiveFill · SolvencyGuard', 'doubles as the Aqua app']}
            highlight
          />
          <Connector note="taker approves the router — no adapter contract needed" />
          <Layer
            eyebrow="Base EVM · settlement"
            title="Aqua pull / push"
            items={['pull tokenOut from maker wallet', 'push tokenIn back to it', 'Aqua holds nothing']}
          />
          <Connector note="every exit from the pool still gated by a zero-knowledge proof" />
          <Layer
            eyebrow="Base EVM · UltraHonk verifiers"
            title="deposit · withdraw · transfer"
            items={['Poseidon2 commitment notes', 'append-only Merkle · depth 20', 'nullifier set · 100-root ring']}
          />
        </div>

        {/* off-chain rail */}
        <aside className="flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a7a7a] dark:text-[#8a8a8a]">off-chain · no authority</span>
          <RailCard title="SDK" lines={['notes · Merkle · Poseidon2', 'UltraHonk proofs (bb.js)', 'Base EVM tx building']} />
          <RailCard title="SwapVM builder" lines={['program bytecode', 'MakerTraits / TakerTraits', 'byte-identical to Solidity']} />
          <RailCard title="Market reader" lines={['Aqua ship / push / dock logs', '1inch token metadata', 'live balances on chain']} />
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
        <span className="text-[#7a7a7a] dark:text-[#8a8a8a]">[ program → quote → settle from the maker wallet ]</span>
      </Label>
      <h3 className="mt-6 max-w-2xl font-display text-[clamp(1.5rem,3.2vw,2.2rem)] font-medium lowercase leading-[1.06] tracking-[-0.02em] text-[#191919] dark:text-[#f5f5f5]">
        how a swap works: from bytecode to a transfer out of someone's wallet.
      </h3>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_16rem]">
        {/* main vertical flow */}
        <div className="flex flex-col">
          <Layer
            eyebrow="Phase 1 · maker"
            title="compose the strategy"
            items={['assemble opcodes into bytecode', 'ship() records the allowance', 'wallet balance unchanged']}
          />
          <Connector note="the program is the order — no signature needed in Aqua mode" />
          <Layer
            eyebrow="Phase 2 · taker"
            title="quote, then swap"
            items={['quote() previews the exact amounts', 'threshold enforces slippage', 'approve the router, call swap()']}
          />
          <Connector note="SwapVM pulls tokenIn itself — the taker can be a plain wallet" />
          <Layer
            eyebrow="Phase 3 · settlement"
            title="Aqua moves the tokens"
            items={['tokenOut leaves the maker wallet', 'tokenIn arrives in it', 'Aqua never holds either']}
            highlight
          />
        </div>

        {/* Technical specs panel */}
        <aside className="flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a7a7a] dark:text-[#8a8a8a]">Program Specifications</span>
          <RailCard title="Constant Product" lines={['x * y = k, in bytecode', 'rounding favours the maker', 'quote equals swap, exactly']} />
          <RailCard title="ExclusiveFill" lines={['only the named taker fills', 'full 20-byte comparison', 'taker read from msg.sender']} />
          <RailCard title="SolvencyGuard" lines={['reads the maker wallet', 'price moves with real backing', 'degrades instead of reverting']} />
        </aside>
      </div>
    </div>
  )
}
