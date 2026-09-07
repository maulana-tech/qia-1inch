import { useState } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits } from 'viem'
import { usePriceQuote } from '../hooks/usePriceQuote'
import { formatAmount, formatPrice, parseAmount } from '../lib/format'
import * as desk from '../lib/desk'
import { tokenDecimals } from '../lib/payments'
import { TOKEN_OPTIONS, assetMeta } from '../lib/tokens'
import { cx } from '../lib/cx'
import { explorerTxUrl } from '../lib/config'
import {
  Button,
  Card,
  ChartIcon,
  Field,
  PageIntro,
  Select,
  ShieldIcon,
  TextInput,
  ToggleGroup,
  XIcon,
} from './ui'
import { PriceChart } from './PriceChart'

// ── Main component ─────────────────────────────────────────────────────────

export function Swap({ embedded }: { embedded?: boolean } = {}) {
  const { address } = useAccount()

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [base, setBase] = useState('WETH')
  const [quote, setQuote] = useState('USDC')
  const [amount, setAmount] = useState('')
  const [showChart, setShowChart] = useState(true)
  const [busy, setBusy] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { price: marketPrice, live: livePrice } = usePriceQuote(base, quote)

  const effectivePrice = marketPrice ?? 0
  const valid = base !== quote && effectivePrice > 0 && parseAmount(amount) > 0
  const total = valid ? effectivePrice * parseAmount(amount) : 0

  /**
   * Menukar langsung lewat meja Aqua.
   *
   * Dulu ini lewat `sdk.swapShielded`, nama peninggalan kolam terlindung
   * padahal isinya sudah memanggil `desk.swap`. Sekarang memanggilnya langsung —
   * satu lapisan tak berguna hilang, dan namanya tidak lagi berbohong.
   */
  async function onPlace() {
    if (!address) return
    const tokenIn = side === 'buy' ? quote : base
    const tokenOut = side === 'buy' ? base : quote
    const inMeta = assetMeta(tokenIn)
    const outMeta = assetMeta(tokenOut)
    if (!inMeta.sac || !outMeta.sac) {
      setError('Meja ini hanya melayani token ERC20.')
      return
    }

    setBusy(true); setError(null); setTxHash(null)
    try {
      const amountIn = side === 'buy' ? total : parseAmount(amount)
      const amountInBase = parseUnits(amountIn.toString(), await tokenDecimals(inMeta.sac as `0x${string}`))
      const { hash } = await desk.swap(
        address,
        inMeta.sac,
        outMeta.sac,
        amountInBase,
        0n,
      )
      setTxHash(hash)
      setAmount('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap gagal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      {!embedded && (
        <PageIntro
          title="Swap"
          subtitle="Likuiditas dari dompet market maker lewat 1inch Aqua. Tidak ada kontrak yang menahan dana."
        />
      )}

      {/* ── Top row: Chart + Order form ───────────────────────────────── */}
      <div className="flex items-stretch gap-4">

        {/* ── Chart panel ────────────────────────────────────────────── */}
        <div
          className={cx(
            'hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-out lg:flex lg:flex-col',
            showChart ? 'flex-1 min-w-0' : 'w-11',
          )}
        >
          {showChart ? (
            <Card className="flex h-full flex-col overflow-hidden p-0">
              {/* Market header bar */}
              <div className="flex items-center gap-3 border-b border-ink-700/60 px-5 py-3.5">
                {/* Pair */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-zinc-100">{base}</span>
                  <span className="font-mono text-zinc-600">/</span>
                  <span className="text-sm text-zinc-400">{quote}</span>
                </div>

                {/* Divider */}
                <span className="h-4 w-px bg-ink-700" />

                {/* Price + live badge */}
                {marketPrice != null ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-semibold tabular-nums text-zinc-100">
                      {formatPrice(marketPrice)}
                    </span>
                    <span className="text-xs text-zinc-500">{quote}</span>
                    <span
                      className={cx(
                        'rounded-none px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
                        livePrice
                          ? 'bg-spectral/10 text-spectral/80'
                          : 'bg-ink-800 text-zinc-600',
                      )}
                    >
                      {livePrice ? '● live' : 'est'}
                    </span>
                  </div>
                ) : (
                  <div className="h-4 w-24 animate-pulse rounded-none bg-ink-700" />
                )}

                {/* Hide chart button */}
                <button
                  type="button"
                  onClick={() => setShowChart(false)}
                  aria-label="Hide chart"
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-none text-zinc-600 transition hover:bg-ink-800 hover:text-zinc-300"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Chart body */}
              <div className="min-h-[300px] flex-1 p-2">
                <PriceChart pair={`${base}/${quote}`} price={marketPrice} />
              </div>
            </Card>
          ) : (
            /* Collapsed chart strip */
            <button
              type="button"
              onClick={() => setShowChart(true)}
              aria-label="Show chart"
              className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-none border border-ink-700 bg-ink-900/40 py-4 transition hover:border-spectral/40 hover:bg-ink-800/60"
            >
              <ChartIcon className="h-4 w-4 shrink-0 text-spectral/70" />
              <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 rotate-180 [writing-mode:vertical-rl]">
                Chart
              </span>
            </button>
          )}
        </div>

        {/* ── Order form ─────────────────────────────────────────────── */}
        <div className="w-full shrink-0 lg:w-[22rem]">
          <Card className="flex h-full flex-col gap-0 p-0 overflow-hidden">

            {/* Form header */}
            <div className="flex items-center justify-between border-b border-ink-700/60 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ChartIcon className="h-4 w-4 text-zinc-500" />
                <h2 className="panel-title">Instant Swap</h2>
              </div>
              {/* Lencana sumber likuiditas */}
              <div className="flex items-center gap-1.5 rounded-full border border-spectral/20 bg-spectral/10 px-2.5 py-1">
                <ShieldIcon className="h-3 w-3 text-spectral/70" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-spectral/70">
                  1inch Aqua
                </span>
              </div>
            </div>

            {/* Form body */}
            <div className="flex flex-col gap-4 p-5">
              {/* Buy / Sell toggle — prominent, semantic colors */}
              <ToggleGroup
                value={side}
                onChange={setSide}
                options={[
                  {
                    value: 'buy',
                    label: 'Buy',
                    activeClassName:
                      'bg-patina-300/15 text-patina-300 shadow-[inset_0_0_0_1px_rgba(214,197,124,0.35)]',
                  },
                  {
                    value: 'sell',
                    label: 'Sell',
                    activeClassName:
                      'bg-red-500/15 text-red-300 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.3)]',
                  },
                ]}
              />

              {/* Token pair selectors */}
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Base asset">
                  <Select
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    options={TOKEN_OPTIONS}
                  />
                </Field>
                <Field label="Quote asset">
                  <Select
                    value={quote}
                    onChange={(e) => setQuote(e.target.value)}
                    options={TOKEN_OPTIONS}
                  />
                </Field>
              </div>
              {base === quote && (
                <p className="-mt-1 text-xs text-spectral/80">Pick two different tokens.</p>
              )}

              {/* Price — meja yang menentukan, jadi hanya ditampilkan */}
              <Field
                label={`Est. Price (${quote} per ${base})`}
                hint={
                  marketPrice != null ? (
                    <span>
                      Pasar{' '}
                      <span className="font-mono tabular-nums text-zinc-300">
                        {formatPrice(marketPrice)}
                      </span>{' '}
                      {quote} · {livePrice ? 'live' : 'perkiraan'}
                    </span>
                  ) : undefined
                }
              >
                <TextInput
                  mono
                  disabled
                  inputMode="decimal"
                  placeholder="0.0000"
                  value={marketPrice != null ? formatPrice(marketPrice) : '...'}
                  readOnly
                />
              </Field>

              {/* Amount */}
              <Field label={`Amount (${base})`}>
                <TextInput
                  mono
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              {/* Estimated total — styled as an inset info row */}
              <div className="flex items-center justify-between rounded-none border border-ink-700/50 bg-ink-900/50 px-4 py-3">
                <span className="text-xs text-zinc-500">
                  Est. {side === 'buy' ? 'cost' : 'proceeds'}
                </span>
                <span className="font-mono text-sm tabular-nums text-zinc-200">
                  {formatAmount(total)} {quote}
                </span>
              </div>

              {/* Place order CTA */}
              <Button
                className="w-full"
                disabled={!valid || busy || !address}
                loading={busy}
                onClick={() => void onPlace()}
              >
                {!address ? 'Hubungkan dompetmu' : busy ? 'Menukar…' : `Swap ${base} for ${quote}`}
              </Button>

              {txHash && (
                <p className="text-center text-xs text-patina-300">
                  Terkirim ·{' '}
                  <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="hover:underline">
                    lihat transaksi
                  </a>
                </p>
              )}
              {error && <p className="text-center text-xs text-yellow-300">{error}</p>}
            </div>
          </Card>
        </div>
      </div>

    </div>
  )
}
