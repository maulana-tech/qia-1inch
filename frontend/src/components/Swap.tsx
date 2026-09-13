import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useSwitchChain } from 'wagmi'
import { formatUnits } from 'viem'

import { usePriceQuote } from '../hooks/usePriceQuote'
import { useDeskQuote } from '../hooks/useDeskQuote'
import { formatPrice } from '../lib/format'
import * as desk from '../lib/desk'
import { DESK_PAIR } from '../lib/strategies'
import { cx } from '../lib/cx'
import {
  CHAIN_NAME,
  DESK_CONFIGURED,
  PROTOCOL_FEE_BPS,
  SAVINGS_FEE_BPS,
  explorerTxUrl,
} from '../lib/config'
import { ACTIVE_CHAIN_ID } from '../lib/wagmi'
import {
  Button,
  Card,
  ChartIcon,
  Field,
  PageIntro,
  ShieldIcon,
  TextInput,
  ToggleGroup,
  XIcon,
} from './ui'
import { PriceChart } from './PriceChart'

/** Pilihan slippage, dalam basis-point 1e4. */
const SLIPPAGE_OPTIONS = [10, 50, 100] as const
const BPS_1E4 = 10_000n

/** Angka satuan dasar → teks ringkas. */
function show(value: bigint | null, decimals: number, digits = 6): string {
  if (value === null) return '—'
  const s = formatUnits(value, decimals)
  const [whole, frac = ''] = s.split('.')
  const trimmed = frac.slice(0, digits).replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole
}

/**
 * Halaman Swap: menukar lewat posisi Aqua meja ini.
 *
 * # Apa yang diperbaiki di sini
 *
 * Versi sebelumnya menampilkan harga CoinGecko dan mengirim `minAmountOut = 0`.
 * Tiga hal salah sekaligus:
 *
 *   1. Harga yang dilihat bukan harga yang didapat. Keluaran ditentukan kurva
 *      `x*y=k` atas saldo maker yang nyata; di kolam kecil selisihnya dari harga
 *      dunia bisa puluhan persen. Sekarang angkanya dari `quote()` di rantai —
 *      fungsi yang sama yang dipakai `swap()`.
 *   2. `minAmountOut = 0` berarti tidak ada perlindungan slippage sama sekali:
 *      swap boleh dieksekusi pada harga berapa pun, termasuk nol. Sekarang
 *      ambangnya dihitung dari kutipan dan bisa dipilih pengguna.
 *   3. Jumlah dihitung dengan float — `harga * jumlah` lalu `parseUnits` atas
 *      hasilnya. `0.1 * 3` menjadi `0.30000000000000004` dan ditolak untuk token
 *      6 desimal; angka kecil dicetak `1e-7` dan tidak bisa diurai. Sekarang
 *      string pengguna diurai langsung ke bigint, tanpa pernah jadi float.
 *
 * Harga pasar tetap ditampilkan, tapi sebagai PEMBANDING — bukan sebagai harga
 * eksekusi. Selisihnya disebut terang-terangan supaya jelas kalau kolamnya
 * memang jauh dari pasar.
 */
export function Swap({ embedded }: { embedded?: boolean } = {}) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const onTargetChain = chainId === ACTIVE_CHAIN_ID

  const [flipped, setFlipped] = useState(false)
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState<number>(50)
  const [showChart, setShowChart] = useState(true)
  const [busy, setBusy] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Pasangannya dari meja, bukan dari daftar token bebas. Dulu pengguna bisa
  // memilih pasangan apa pun dari registry — dan pasangan yang tidak punya
  // likuiditas gagal di rantai dengan galat yang tak terbaca.
  const [pay, receive] = flipped ? [DESK_PAIR[1], DESK_PAIR[0]] : [DESK_PAIR[0], DESK_PAIR[1]]

  const q = useDeskQuote(pay.address, receive.address, amount, address)
  const { price: refPrice, live: refLive } = usePriceQuote(pay.symbol, receive.symbol)

  /** Ambang yang benar-benar dikirim ke rantai. */
  const minOut = useMemo(
    () => (q.amountOut === null ? null : (q.amountOut * (BPS_1E4 - BigInt(slippageBps))) / BPS_1E4),
    [q.amountOut, slippageBps],
  )

  /** Harga efektif kutipan, untuk dibandingkan dengan pasar. */
  const deskPrice = useMemo(() => {
    if (q.amountIn === null || q.amountOut === null || q.amountIn === 0n) return null
    return Number(formatUnits(q.amountOut, q.decOut)) / Number(formatUnits(q.amountIn, q.decIn))
  }, [q.amountIn, q.amountOut, q.decIn, q.decOut])

  const deviation = deskPrice !== null && refPrice ? (deskPrice / refPrice - 1) * 100 : null
  const ready = q.amountIn !== null && q.amountOut !== null && minOut !== null && !q.loading

  async function onSwap() {
    if (!address || q.amountIn === null || minOut === null) return
    setBusy(true); setError(null); setTxHash(null)
    try {
      const { hash } = await desk.swap(address, pay.address, receive.address, q.amountIn, minOut)
      setTxHash(hash)
      setAmount('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!DESK_CONFIGURED) {
    return (
      <Card>
        <div className="p-6 text-sm text-zinc-500">
          The desk is not configured. Set <code>VITE_AQUA</code> and{' '}
          <code>VITE_SWAP_VM_ROUTER</code> in <code>frontend/.env.local</code>.
        </div>
      </Card>
    )
  }

  if (address && !onTargetChain) {
    return (
      <Card>
        <div className="space-y-3 p-6">
          <p className="text-sm text-warn">
            Your wallet is on chain {chainId}. Switch to {CHAIN_NAME} (chain {ACTIVE_CHAIN_ID}) to trade.
          </p>
          <Button size="sm" variant="outline" onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}>
            Switch to {CHAIN_NAME}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      {!embedded && (
        <PageIntro
          title="Swap"
          subtitle="Liquidity straight from a market maker's wallet via 1inch Aqua. No contract holds your funds."
        />
      )}

      <div className="flex items-stretch gap-4">
        {/* ── Chart ─────────────────────────────────────────────────────── */}
        <div
          className={cx(
            'hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-out lg:flex lg:flex-col',
            showChart ? 'flex-1 min-w-0' : 'w-11',
          )}
        >
          {showChart ? (
            <Card className="flex h-full flex-col overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-ink-700/60 px-5 py-3.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-zinc-100">{DESK_PAIR[0].symbol}</span>
                  <span className="font-mono text-zinc-600">/</span>
                  <span className="text-sm text-zinc-400">{DESK_PAIR[1].symbol}</span>
                </div>

                <span className="h-4 w-px bg-ink-700" />

                {/* Label "pasar" sengaja eksplisit: ini BUKAN harga meja. */}
                {refPrice != null ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-semibold tabular-nums text-zinc-100">
                      {formatPrice(refPrice)}
                    </span>
                    <span className="text-xs text-zinc-500">market</span>
                    <span
                      className={cx(
                        'px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
                        refLive ? 'bg-spectral/10 text-spectral/80' : 'bg-ink-800 text-zinc-600',
                      )}
                    >
                      {refLive ? '● live' : 'est'}
                    </span>
                  </div>
                ) : (
                  <div className="h-4 w-24 animate-pulse bg-ink-700" />
                )}

                <button
                  type="button"
                  onClick={() => setShowChart(false)}
                  aria-label="Hide chart"
                  className="ml-auto flex h-7 w-7 items-center justify-center text-zinc-600 transition hover:bg-ink-800 hover:text-zinc-300"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-h-[300px] flex-1 p-2">
                <PriceChart
                  pair={`${DESK_PAIR[0].symbol}/${DESK_PAIR[1].symbol}`}
                  price={refPrice}
                />
              </div>
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setShowChart(true)}
              aria-label="Show chart"
              className="flex h-full w-full flex-col items-center justify-center gap-3 border border-ink-700 bg-ink-900/40 py-4 transition hover:border-spectral/40 hover:bg-ink-800/60"
            >
              <ChartIcon className="h-4 w-4 shrink-0 text-spectral/70" />
              <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 rotate-180 [writing-mode:vertical-rl]">
                Chart
              </span>
            </button>
          )}
        </div>

        {/* ── Form ──────────────────────────────────────────────────────── */}
        <div className="w-full shrink-0 lg:w-[22rem]">
          <Card className="flex h-full flex-col gap-0 overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-ink-700/60 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ChartIcon className="h-4 w-4 text-zinc-500" />
                <h2 className="panel-title">Instant Swap</h2>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-spectral/20 bg-spectral/10 px-2.5 py-1">
                <ShieldIcon className="h-3 w-3 text-spectral/70" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-spectral/70">
                  1inch Aqua
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5">
              {/* Kamu bayar */}
              <Field label={`You pay (${pay.symbol})`}>
                <TextInput
                  mono
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-ink-700/60" />
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="border border-ink-700 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 transition hover:border-spectral/40 hover:text-zinc-300"
                >
                  flip
                </button>
                <span className="h-px flex-1 bg-ink-700/60" />
              </div>

              {/* Kamu terima — dari rantai */}
              <Field
                label={`You receive (${receive.symbol})`}
                hint={
                  deskPrice !== null ? (
                    <span>
                      1 {pay.symbol} ={' '}
                      <span className="font-mono tabular-nums text-zinc-300">
                        {formatPrice(deskPrice)}
                      </span>{' '}
                      {receive.symbol} · on-chain
                      {deviation !== null && (
                        <>
                          {' · '}
                          <span
                            className={
                              Math.abs(deviation) > 5 ? 'text-warn' : 'text-zinc-500'
                            }
                          >
                            {deviation >= 0 ? '+' : ''}
                            {deviation.toFixed(1)}% vs market
                          </span>
                        </>
                      )}
                    </span>
                  ) : undefined
                }
              >
                <TextInput
                  mono
                  disabled
                  readOnly
                  placeholder="0.00"
                  value={q.loading ? '…' : show(q.amountOut, q.decOut)}
                />
              </Field>

              {/* Slippage */}
              <Field label="Slippage tolerance">
                <ToggleGroup
                  value={String(slippageBps)}
                  onChange={(v) => setSlippageBps(Number(v))}
                  options={SLIPPAGE_OPTIONS.map((bps) => ({
                    value: String(bps),
                    label: `${bps / 100}%`,
                  }))}
                />
              </Field>

              {/* Rincian — semuanya angka, tidak ada janji */}
              <div className="space-y-1.5 border border-ink-700/50 bg-ink-900/50 px-4 py-3 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-zinc-500">Minimum received</span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {show(minOut, q.decOut)} {receive.symbol}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-zinc-500">Maker fee</span>
                  <span className="font-mono tabular-nums text-zinc-400">
                    {Number(SAVINGS_FEE_BPS) / 1e7}%
                  </span>
                </div>
                {PROTOCOL_FEE_BPS > 0n && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-zinc-500">Protocol fee</span>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {Number(PROTOCOL_FEE_BPS) / 1e7}%
                    </span>
                  </div>
                )}
                <p className="pt-1 text-[11px] leading-relaxed text-zinc-600">
                  Both fees are already inside the number above — each is taken from the input
                  before the curve, so the quote is already net of them.
                </p>
              </div>

              <Button
                className="w-full"
                disabled={!ready || busy || !address}
                loading={busy}
                onClick={() => void onSwap()}
              >
                {!address
                  ? 'Connect your wallet'
                  : busy
                    ? 'Swapping…'
                    : `Swap ${pay.symbol} for ${receive.symbol}`}
              </Button>

              {txHash && (
                <div className="space-y-3 rounded-xl border border-patina-500/20 bg-patina-500/5 p-4">
                  <p className="text-center text-sm font-medium text-patina-300">
                    Swap completed
                  </p>
                  <p className="text-center text-xs text-zinc-500">
                    <a
                      href={explorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-spectral-soft underline underline-offset-2 transition hover:text-spectral"
                    >
                      View transaction ↗
                    </a>
                  </p>
                  <div className="flex flex-col gap-2 pt-1">
                    <p className="text-center text-[11px] uppercase tracking-wider text-zinc-500">What's next?</p>
                    <div className="flex gap-2">
                      <Link
                        to="/strategy"
                        className="flex-1 rounded-lg border border-spectral/15 bg-spectral/5 px-3 py-2.5 text-center text-xs font-medium text-spectral/80 transition hover:border-spectral/30 hover:bg-spectral/10 hover:text-spectral"
                      >
                        Open position
                      </Link>
                      <Link
                        to="/savings"
                        className="flex-1 rounded-lg border border-spectral/15 bg-spectral/5 px-3 py-2.5 text-center text-xs font-medium text-spectral/80 transition hover:border-spectral/30 hover:bg-spectral/10 hover:text-spectral"
                      >
                        Savings
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setTxHash(null); setAmount('') }}
                        className="flex-1 rounded-lg border border-spectral/15 bg-spectral/5 px-3 py-2.5 text-center text-xs font-medium text-spectral/80 transition hover:border-spectral/30 hover:bg-spectral/10 hover:text-spectral"
                      >
                        Swap again
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {(error ?? q.error) && (
                <p className="text-center text-xs text-warn">{error ?? q.error}</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
