import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits } from 'viem'
import { disassemble, type Instruction } from '@iqia/swapvm'

import {
  decodeOrder,
  fetchActiveStrategies,
  fetchPositionTrades,
  type ActiveStrategy,
  type PositionTrade,
} from '../lib/markets'
import { positionBalancesOrZero } from '../lib/savings'
import { tokenDecimals } from '../lib/payments'
import { CHAIN_NAME, explorerContractUrl, explorerTxUrl } from '../lib/config'
import { cx } from '../lib/cx'
import { Button, Card, CardContent, PageHeader, Separator, Spinner } from '../components/ui'

/**
 * Satu posisi Aqua, dibuka penuh.
 *
 * # Kenapa halaman ini ada
 *
 * Sebelumnya tiap baris di papan Markets menaut ke `/app` — halaman yang sedang
 * dibuka. Ia terlihat seperti tautan, berperilaku seperti tautan, dan tidak
 * melakukan apa pun. Dari 38 baris, 37 begitu.
 *
 * Yang lebih penting: papan itu memuat posisi dari 11 maker di registry Aqua
 * resmi, dan satu-satunya hal yang bisa dilakukan pengguna dengan mereka adalah
 * MEMBACANYA. Halaman ini yang membuat "membaca" berarti sesuatu — bukan cuma
 * saldo, tapi programnya, dibongkar jadi instruksi.
 *
 * Itu juga argumen produknya. Di AMM mana pun, "strategi" sebuah pool adalah
 * kode yang sudah ter-deploy dan sama untuk semua orang. Di sini tiap posisi
 * membawa programnya sendiri, dan Aqua memancarkannya utuh — jadi strategi siapa
 * pun bisa dibongkar tanpa izin, tanpa API, tanpa bertanya kepada pemiliknya.
 */

const SOURCE_LABEL = {
  ours: 'iqia',
  official: '1inch SwapVM',
  other: 'other app',
} as const

/** Penjelasan singkat tiap instruksi, untuk yang belum hafal nomornya. */
const WHAT_IT_DOES: Record<string, string> = {
  SOLVENCY_GUARD: "prices against the maker's real wallet backing",
  EXCLUSIVE_FILL: 'only one named address may fill this order',
  FLAT_FEE_IN: 'takes a flat fee from the input, before the curve',
  AQUA_PROTOCOL_FEE_IN: 'routes a share of the input to a third address',
  XYC_SWAP: 'constant-product curve, x·y=k',
  XYC_CONCENTRATE: 'concentrates liquidity into a price band',
  DECAY: 'lets the quote catch up gradually after a price move',
  SALT: 'makes the strategy hash unique — no behaviour',
  DEADLINE: 'refuses to execute after a timestamp',
  JUMP: 'control flow',
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function InstructionRow({ ins }: { ins: Instruction }) {
  const known = ins.name !== null
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-spectral/[0.07] py-2.5 last:border-0">
      <span className="w-10 shrink-0 font-mono text-xs text-spectral/35">
        {ins.offset.toString().padStart(3, '0')}
      </span>
      <span className="w-8 shrink-0 font-mono text-xs text-spectral/45">{ins.opcode}</span>
      <span
        className={cx(
          'font-mono text-sm',
          known ? 'text-spectral/90' : 'text-yellow-300/80',
        )}
      >
        {/* Opcode tim lain tidak selalu ada di tabel kita, dan menebak namanya
            lebih buruk daripada mengaku tidak tahu. */}
        {ins.name ?? `unknown opcode ${ins.opcode}`}
      </span>
      {ins.name && WHAT_IT_DOES[ins.name] && (
        <span className="text-xs text-spectral/45">{WHAT_IT_DOES[ins.name]}</span>
      )}
      {ins.args !== '0x' && (
        <span className="ml-auto break-all font-mono text-[11px] text-spectral/35">
          {ins.args}
        </span>
      )}
    </div>
  )
}

export function MarketPage() {
  const { hash } = useParams<{ hash: string }>()

  const [strategy, setStrategy] = useState<ActiveStrategy | null>(null)
  const [balances, setBalances] = useState<[bigint, bigint] | null>(null)
  const [decimals, setDecimals] = useState<[number, number]>([18, 18])
  const [trades, setTrades] = useState<PositionTrade[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hash) return
    setLoading(true)
    setError(null)
    try {
      const all = await fetchActiveStrategies()
      const found = all.find((s) => s.hash.toLowerCase() === hash.toLowerCase()) ?? null
      setStrategy(found)

      if (found) {
        const tokens = [...found.tokens]
        if (tokens.length >= 2) {
          const [d0, d1] = await Promise.all([
            tokenDecimals(tokens[0] as `0x${string}`),
            tokenDecimals(tokens[1] as `0x${string}`),
          ])
          setDecimals([d0, d1])
          setBalances(
            await positionBalancesOrZero(
              found.maker as `0x${string}`,
              found.hash,
              tokens[0],
              tokens[1],
              found.app,
            ),
          )
        }
        setTrades(await fetchPositionTrades(found.hash))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read this position.')
    } finally {
      setLoading(false)
    }
  }, [hash])

  useEffect(() => {
    void load()
  }, [load])

  const order = strategy ? decodeOrder(strategy.strategy) : null

  let program: Instruction[] | null = null
  let programError: string | null = null
  if (order) {
    try {
      program = disassemble(order.data as `0x${string}`)
    } catch (e) {
      programError = e instanceof Error ? e.message : 'could not be read'
    }
  }

  const tokens = strategy ? [...strategy.tokens] : []

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8">
      <section className="space-y-8">
        <div>
          <Link to="/app" className="coord-label transition hover:text-spectral/80">
            ← all markets
          </Link>
          <div className="mt-3">
            <PageHeader
              title={strategy ? `Position ${short(strategy.hash)}` : 'Position'}
              caption={`One Aqua position on ${CHAIN_NAME}, opened all the way up — its balances, its trades, and the bytecode that prices it.`}
            />
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="flex items-center gap-3 text-sm text-spectral/60">
              <Spinner className="h-4 w-4" /> Reading the position from the chain…
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="text-sm text-yellow-300">{error}</CardContent>
          </Card>
        ) : !strategy ? (
          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm text-spectral/80">This position is not in the active list.</p>
              <p className="max-w-2xl text-sm leading-relaxed text-spectral/55">
                It may have been closed, or it may sit outside the block window the app scans.
                A closed position keeps its history on chain — nothing is lost, it is just no
                longer quoting.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ── Siapa dan di mana ─────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-spectral/[0.08] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-spectral/70">
                    {SOURCE_LABEL[strategy.source]}
                  </span>
                  {strategy.source !== 'ours' && (
                    <span className="rounded-full bg-ink-700/60 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                      read only
                    </span>
                  )}
                </div>

                <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
                  <Field label="maker" value={strategy.maker} href={explorerContractUrl(strategy.maker)} />
                  <Field label="app" value={strategy.app} href={explorerContractUrl(strategy.app)} />
                </div>

                {balances && tokens.length >= 2 && (
                  <>
                    <Separator />
                    <div>
                      <p className="coord-label mb-3">registered liquidity</p>
                      <div className="flex flex-wrap gap-10">
                        {tokens.slice(0, 2).map((t, i) => (
                          <div key={t}>
                            <div className="coord-label">{short(t)}</div>
                            <div className="mt-1 font-mono text-xl tabular-nums text-spectral/90">
                              {formatUnits(balances[i], decimals[i])}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-spectral/45">
                        These tokens have not moved. Aqua records an allowance against the maker's
                        own wallet — the balance above is what this position is permitted to trade,
                        not what it is holding.
                      </p>
                    </div>
                  </>
                )}

                {strategy.source === 'ours' && (
                  <>
                    <Separator />
                    <Link to="/swap">
                      <Button size="sm">Trade this market</Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Programnya ────────────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-base font-medium text-spectral/85">The pricing program</p>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-spectral/55">
                    This is not a description of the strategy — it is the strategy. Aqua emits the
                    whole order in its <code>Shipped</code> event, so anyone can disassemble any
                    maker's program without permission.
                  </p>
                </div>

                {programError ? (
                  <p className="text-sm text-yellow-300">
                    This program could not be disassembled: {programError}
                  </p>
                ) : program && program.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <div className="min-w-[32rem]">
                        {program.map((ins) => (
                          <InstructionRow key={ins.offset} ins={ins} />
                        ))}
                      </div>
                    </div>
                    <details className="group">
                      <summary className="coord-label cursor-pointer list-none transition hover:text-spectral/80">
                        raw bytecode ▸
                      </summary>
                      <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-spectral/40">
                        {order?.data}
                      </p>
                    </details>
                  </>
                ) : (
                  <p className="text-sm text-spectral/55">This position carries an empty program.</p>
                )}
              </CardContent>
            </Card>

            {/* ── Riwayat ───────────────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-base font-medium text-spectral/85">Swaps through this position</p>
                  <p className="mt-1.5 text-sm text-spectral/55">
                    Rebuilt from Aqua's <code>Pulled</code> and <code>Pushed</code> events.
                  </p>
                </div>
                {trades.length === 0 ? (
                  <p className="text-sm text-spectral/45">
                    Nobody has swapped through this position yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {trades.map((t) => (
                      <div
                        key={t.txHash}
                        className="flex flex-wrap items-baseline justify-between gap-3 border-b border-spectral/[0.07] py-2 text-sm last:border-0"
                      >
                        <span className="coord-label">block {t.blockNumber.toString()}</span>
                        <span className="font-mono text-xs text-spectral/70">
                          {short(t.tokenIn)} → {short(t.tokenOut)}
                        </span>
                        {explorerTxUrl(t.txHash) && (
                          <a
                            href={explorerTxUrl(t.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-spectral/60 underline underline-offset-4 hover:text-spectral/90"
                          >
                            view ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </div>
  )
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="min-w-0">
      <div className="coord-label">{label}</div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all font-mono text-sm text-spectral/80 underline underline-offset-4 hover:text-spectral"
        >
          {value}
        </a>
      ) : (
        <div className="mt-1 break-all font-mono text-sm text-spectral/80">{value}</div>
      )}
    </div>
  )
}

export default MarketPage
