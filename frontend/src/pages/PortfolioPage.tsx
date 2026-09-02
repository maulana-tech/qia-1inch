import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLarel } from '../hooks/useLarel'
import { useReveal } from '../hooks/useReveal'
import { loadNotes, type StoredNote } from '../lib/note-store'
import { assetMeta } from '../lib/tokens'
import { formatAmount, formatUsd } from '../lib/format'
import { cx } from '../lib/cx'
import { AssetAvatar, ChevronDownIcon, EyeGlyph } from '../components/ui'
import { ScrambleNumber } from '../components/ScrambleNumber'
import type { AssetCode } from '../lib/larel-sdk'
import { useSettings, formatMoney } from '../lib/settings'

const MASK = '••••••'

const SOURCE_LABEL: Record<NonNullable<StoredNote['source']>, string> = {
  deposit: 'Deposit',
  received: 'Received',
  change: 'Change',
}

/** A stored note's amount as a human number, using its own decimals (falls back to the token's). */
function noteHuman(note: StoredNote): number {
  const decimals = note.decimals ?? assetMeta(note.assetCode).decimals
  return Number(BigInt(note.amount)) / 10 ** decimals
}

/** The wallet's unspent notes grouped by asset, largest first — the per-asset breakdown. */
function groupUnspentNotes(): Map<AssetCode, StoredNote[]> {
  const map = new Map<AssetCode, StoredNote[]>()
  for (const n of loadNotes()) {
    if (n.spent) continue
    const arr = map.get(n.assetCode) ?? []
    arr.push(n)
    map.set(n.assetCode, arr)
  }
  for (const arr of map.values()) arr.sort((a, b) => noteHuman(b) - noteHuman(a))
  return map
}

export function PortfolioPage() {
  const { balances, loadingBalances } = useLarel()
  const { revealed, toggle } = useReveal()
  const { currency, locale } = useSettings()
  const [open, setOpen] = useState<AssetCode | null>(null)

  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)
  // Recomputed each render; the page re-renders whenever balances refresh (which is when the
  // spent flags used below are reconciled), so the breakdown stays in sync with the totals.
  const notesByAsset = groupUnspentNotes()

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-20 pt-12">
      {/* Total */}
      <header className="mb-10 flex flex-col items-center border-b border-spectral/10 pb-10 text-center">
        <div className="coord-label mb-4 tracking-widest text-zinc-400">total shielded balance</div>
        <div className="flex items-center gap-4">
          {loadingBalances ? (
            <span className="display-hd text-5xl text-spectral/25">{MASK}</span>
          ) : (
            <ScrambleNumber
              value={formatMoney(total, currency, locale)}
              revealed={revealed}
              className="display-hd text-[clamp(2.5rem,8vw,4rem)] tracking-tight text-spectral"
            />
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={revealed ? 'Hide balances' : 'Show balances'}
            className="mt-2 text-spectral/40 transition hover:text-spectral"
          >
            <EyeGlyph off={!revealed} className="h-6 w-6" />
          </button>
        </div>
        <div className="coord-label mt-4 text-[10px] text-zinc-500">
          {revealed ? `Value in ${currency.toUpperCase()}` : 'Private by default'}
        </div>
      </header>

      {/* Quick Actions */}
      <div className="mb-10 flex gap-3 sm:gap-4">
        <Link to="/deposit" className="group flex-1 rounded-none border border-spectral/10 bg-ink-900/40 py-4 text-center backdrop-blur-sm transition hover:border-red-500 hover:bg-spectral/[0.02]">
          <span className="coord-label text-spectral-soft transition group-hover:text-spectral">Bridge</span>
        </Link>
        <Link to="/pay" className="group flex-1 rounded-none border border-spectral/10 bg-ink-900/40 py-4 text-center backdrop-blur-sm transition hover:border-red-500 hover:bg-spectral/[0.02]">
          <span className="coord-label text-spectral-soft transition group-hover:text-spectral">Transfer</span>
        </Link>
        <Link to="/swap" className="group flex-1 rounded-none border border-spectral/10 bg-ink-900/40 py-4 text-center backdrop-blur-sm transition hover:border-red-500 hover:bg-spectral/[0.02]">
          <span className="coord-label text-spectral-soft transition group-hover:text-spectral">Trade</span>
        </Link>
      </div>

      {/* Holdings */}
      {loadingBalances ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-none border border-spectral/10 bg-ink-900/40" />
          ))}
        </div>
      ) : balances.length === 0 ? (
        <div className="rounded-none border border-spectral/10 bg-ink-900/40 px-6 py-14 text-center">
          <p className="text-sm text-zinc-400">Nothing shielded yet.</p>
          <Link to="/deposit" className="coord-label mt-3 inline-block text-spectral/70 transition hover:text-spectral">
            deposit assets →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {balances.map((b) => {
            const notes = notesByAsset.get(b.asset) ?? []
            const isOpen = open === b.asset
            const meta = assetMeta(b.asset)
            return (
              <div key={b.asset} className="overflow-hidden rounded-none border border-spectral/10 bg-ink-900/40">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : b.asset)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 p-5 text-left transition hover:bg-spectral/[0.04]"
                >
                  <AssetAvatar code={b.asset} className="h-11 w-11" />
                  <div className="min-w-0">
                    <div className="font-display text-base font-semibold text-spectral-soft">{b.asset}</div>
                    <div className="truncate text-xs text-zinc-500 mt-0.5">
                      {meta.name} · {notes.length} note{notes.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="font-mono text-base tabular-nums text-spectral-soft">{revealed ? b.amount : MASK}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{revealed ? `≈ ${formatUsd(b.usdEstimate)}` : ''}</div>
                  </div>
                  <ChevronDownIcon
                    className={cx('ml-2 h-4 w-4 shrink-0 text-zinc-500 transition-transform', isOpen && 'rotate-180')}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-spectral/10 bg-black/20 px-5 py-4">
                    <div className="coord-label mb-3 text-zinc-500">UTXO Notes Breakdown</div>
                    {notes.length === 0 ? (
                      <p className="text-xs text-zinc-500">No spendable notes.</p>
                    ) : (
                      <ul className="space-y-2">
                        {notes.map((n) => (
                          <li key={n.commitment} className="flex items-center gap-3 text-xs rounded border border-spectral/5 bg-ink-900/20 px-3 py-2">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-spectral/40" />
                            <span className="w-16 font-medium text-zinc-400">{SOURCE_LABEL[n.source ?? 'received']}</span>
                            {n.leafIndex !== undefined && (
                              <span className="font-mono text-[10px] text-zinc-600 bg-black/30 px-1.5 py-0.5 rounded">#{n.leafIndex}</span>
                            )}
                            <span className="ml-auto font-mono tabular-nums text-zinc-300">
                              {revealed ? `${formatAmount(noteHuman(n))} ${n.assetCode}` : MASK}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PortfolioPage
