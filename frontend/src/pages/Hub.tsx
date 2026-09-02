import { Link } from 'react-router-dom'
import { useLarel } from '../hooks/useLarel'
import { useReveal } from '../hooks/useReveal'
import { cx } from '../lib/cx'
import { ScrambleNumber } from '../components/ScrambleNumber'
import { ProvenLedger } from '../components/ProvenLedger'
import { CoinBadge } from '../components/BrandIcons'
import { EyeGlyph } from '../components/ui'
import { useSettings, formatMoney } from '../lib/settings'

import asset1 from '../../assets/assets-01.webp'
import asset2 from '../../assets/assets-02.webp'
import asset3 from '../../assets/assets-03.webp'
import asset4 from '../../assets/assets-04.webp'

const MASK = '######'

type GridItem =
  | { type: 'module'; label: string; to: string; title: string; desc: string }
  | { type: 'asset'; src: string }

const GRID_ITEMS: GridItem[] = [
  { type: 'module', label: 'Bridge', to: '/deposit', title: 'Cross the Veil', desc: 'Bridge your assets seamlessly between the public Flare network and the Larel shielded pool. This process utilizes Zero-Knowledge proofs to ensure that your deposits and withdrawals remain completely untraceable, granting you absolute privacy.' },
  { type: 'asset', src: asset1 },
  { type: 'asset', src: asset2 },
  { type: 'module', label: 'Transfer', to: '/pay', title: 'Send into the Dark', desc: 'Execute truly anonymous zero-knowledge payments to anyone on the network. Both the sender\'s identity and the exact transaction amount remain mathematically hidden from the public ledger, providing you with uncompromising financial confidentiality.' },
  { type: 'module', label: 'Trade', to: '/swap', title: 'The Sealed Book', desc: 'Access our state-of-the-art confidential matching engine powered by Trusted Execution Environments. Trade assets peer-to-peer in a completely dark pool where your orders are matched at the exact midpoint, guaranteeing zero MEV exposure and zero slippage.' },
  { type: 'asset', src: asset3 },
  { type: 'asset', src: asset4 },
  { type: 'module', label: 'Receive', to: '/receive', title: 'Your Cipher', desc: 'Generate a single-use, cryptographically secure stealth address to accept inbound payments. Share this unique cipher with anyone to receive funds privately, without ever exposing your main identity or linking your transaction history.' },
]

export function Hub() {
  const { balances, loadingBalances } = useLarel()
  const { revealed, toggle } = useReveal()
  const { currency, locale } = useSettings()
  const total = balances.reduce((sum, b) => sum + b.usdEstimate, 0)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-12">
      <section className="flex flex-col items-center pb-12 text-center">
        <div className="flex items-center gap-3">
          <span className="coord-label">shielded · [ poseidon · merkle ]</span>
          <button
            type="button"
            onClick={toggle}
            aria-label={revealed ? 'Hide balance' : 'Reveal balance'}
            className="text-spectral/50 transition hover:text-spectral"
          >
            <EyeGlyph off={!revealed} className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex min-h-[4.5rem] items-center">
          {loadingBalances ? (
            <span className="display-hd text-5xl text-spectral/25">••••••</span>
          ) : (
            <ScrambleNumber value={formatMoney(total, currency, locale)} revealed={revealed} className="display-hd text-[clamp(2.6rem,9vw,5rem)]" />
          )}
        </div>
        <div className="coord-label mt-3">
          {revealed ? `your shielded total · ${currency.toUpperCase()}` : 'private by default'}
        </div>

        {!loadingBalances && balances.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {balances.map((b) => (
              <span key={b.asset} className="flex items-center gap-2">
                <CoinBadge name={b.asset} size="sm" />
                <span className="font-mono text-sm text-zinc-200">{b.asset}</span>
                <span
                  className={cx(
                    'font-mono text-sm tabular-nums',
                    revealed ? 'text-zinc-100' : 'wr-scramble-glyph wr-scramble-char',
                  )}
                >
                  {revealed ? b.amount : MASK}
                </span>
              </span>
            ))}
          </div>
        )}

        {!loadingBalances && balances.length === 0 && (
          <Link to="/deposit" className="coord-label mt-8 text-spectral/70 transition hover:text-spectral">
            nothing shielded yet — cross the veil →
          </Link>
        )}

        <div className="mt-10 w-full">
          <ProvenLedger />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {GRID_ITEMS.map((item, i) => {
          if (item.type === 'asset') {
            return (
              <div
                key={`asset-${i}`}
                className="relative overflow-hidden rounded-none border border-spectral/10 bg-ink-900/40 p-6 backdrop-blur-sm min-h-[480px]"
              >
                <div className="absolute inset-0">
                  <img
                    src={item.src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            )
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              className="group relative overflow-hidden rounded-none border border-spectral/10 bg-ink-900/40 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-red-500 flex flex-col min-h-[480px]"
            >
              <div className="relative z-10 flex flex-1 flex-col">
                <div className="coord-label mb-2">{item.label}</div>
                <h3 className="display-hd text-xl text-spectral-soft">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.desc}</p>
                <span className="coord-label mt-auto pt-4 inline-block text-spectral/70 transition group-hover:text-spectral">enter →</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default Hub
