import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import {
  DESK_PAIR,
  STRATEGIES,
  impliedSpotE18,
  strategyMeta,
  strategyOrder,
  type StrategyId,
  type StrategyParams,
} from '../lib/strategies'
import { openPosition, splitAmounts, strategyHashOf, walletBalances } from '../lib/savings'
import { DESK_CONFIGURED, DESK_SURCHARGE_BPS, explorerTxUrl } from '../lib/config'
import { cx } from '../lib/cx'
import { Button, Card, CardContent, PageHeader, TextInput } from '../components/ui'

const STEPS = ['Capital', 'Strategy', 'Settings', 'Ship'] as const
const PERCENT_PRESETS = [10, 25, 50, 75] as const
/**
 * Pita sempit TIDAK otomatis lebih menghasilkan.
 *
 * Pitanya dipusatkan pada harga tersirat saldomu, sedangkan `XYCConcentrate`
 * menurunkan harga spot-nya dari saldo DAN batas pita. Keduanya berbeda begitu
 * saldomu tidak seimbang, jadi posisinya lahir condong ke satu sisi — dan makin
 * sempit pitanya, makin tajam kecondongan itu. Terukur di
 * `contracts/test/Strategies.t.sol`: pada 2 WETH lawan 7000 USDC, pita 10%
 * justru memberi hasil lebih kecil daripada pita 25%.
 */
const BAND_PRESETS = [
  { bps: 500, label: '±5%', note: 'Tightest, but the quickest to fall out of band and the most lopsided when your balances are.' },
  { bps: 1000, label: '±10%', note: 'A reasonable starting point for a pair that moves normally.' },
  { bps: 2500, label: '±25%', note: 'Loose. Rarely falls out of band, and tolerates lopsided balances better.' },
  { bps: 5000, label: '±50%', note: 'Nearly the full range. Thin upside, thin risk.' },
] as const
const DECAY_PRESETS = [
  { s: 60, label: '1 menit' },
  { s: 300, label: '5 menit' },
  { s: 900, label: '15 menit' },
] as const

/**
 * Salt baru tiap posisi dikirim.
 *
 * Aqua menandai strategi yang sudah di-`dock` sebagai `0xff` sementara `ship`
 * menuntut `0`, jadi satu `strategyHash` cuma sah SEKALI seumur hidup. Nilai
 * tetap membuat percobaan kedua orang yang sama gagal dengan
 * `StrategiesMustBeImmutable` — error yang sama sekali tidak menjelaskan
 * sebabnya.
 */
const freshSalt = () => BigInt(Date.now())

function fmt(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (value % base).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/** bps SwapVM (1e9) → persen yang enak dibaca. */
const asPercent = (bps: bigint) => Number(bps) / 1e7

function Stepper({ at, done, onJump }: { at: number; done: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {STEPS.map((label, i) => {
        const reachable = i <= done
        const active = i === at
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(i)}
              className={cx(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition',
                active && 'bg-spectral/15 text-spectral-soft ring-1 ring-spectral/30',
                !active && reachable && 'text-zinc-400 hover:bg-ink-800/60 hover:text-zinc-200',
                !reachable && 'cursor-not-allowed text-zinc-600',
              )}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cx(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                  i < done ? 'bg-patina-500/20 text-patina-300' : 'bg-ink-800 text-zinc-400',
                )}
              >
                {i < done ? <CheckIcon className="h-3 w-3" /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="text-zinc-700" aria-hidden>·</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs text-spectral/60">{label}</span>
      <span className="text-right text-sm text-zinc-200">{children}</span>
    </div>
  )
}

export function StrategyPage() {
  const { address } = useAccount()
  const [step, setStep] = useState(0)
  const [furthest, setFurthest] = useState(0)

  const [percent, setPercent] = useState(25)
  const [id, setId] = useState<StrategyId | null>(null)
  const [feePercent, setFeePercent] = useState(0.3)
  const [bandBps, setBandBps] = useState(1000)
  const [decayPeriod, setDecayPeriod] = useState(300)
  const [taker, setTaker] = useState('')
  /** Dikunci sekali per kunjungan supaya pratinjau program tidak berubah tiap render. */
  const [saltValue] = useState(freshSalt)

  const [balances, setBalances] = useState<[bigint, bigint] | null>(null)
  const [busy, setBusy] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address || !DESK_CONFIGURED) return
    try {
      setBalances(await walletBalances(address, DESK_PAIR[0].address, DESK_PAIR[1].address))
    } catch {
      setBalances(null)
    }
  }, [address])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const split = useMemo(
    () => (balances ? splitAmounts(balances, percent) : ([0n, 0n] as [bigint, bigint])),
    [balances, percent],
  )
  const hasCapital = split[0] > 0n && split[1] > 0n

  const params = useMemo<StrategyParams | null>(() => {
    if (!id) return null
    const base: StrategyParams = {
      salt: saltValue,
      feeBps: BigInt(Math.round(feePercent * 1e7)),
      surchargeBps: DESK_SURCHARGE_BPS,
    }
    if (id === 'terkonsentrasi') {
      if (!hasCapital) return null
      return {
        ...base,
        bandBps,
        spotE18: impliedSpotE18(DESK_PAIR[0].address, split[0], DESK_PAIR[1].address, split[1]),
      }
    }
    if (id === 'anti-arbitrase') return { ...base, decayPeriod }
    if (id === 'meja-privat') {
      if (!isAddress(taker)) return null
      return { ...base, exclusiveTaker: taker }
    }
    return base
  }, [id, feePercent, bandBps, decayPeriod, taker, hasCapital, split, saltValue])

  const built = useMemo(() => {
    if (!address || !id || !params) return null
    try {
      const order = strategyOrder(address, id, params)
      return { order, hash: strategyHashOf(order) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to assemble the program.' } as const
    }
  }, [address, id, params])

  /**
   * Kenapa tombol lanjut mati. Selalu ada alasannya, tidak pernah mati diam-diam.
   *
   * Menjelajah pilihan sengaja tidak butuh dompet — orang harus bisa membaca
   * keempat strategi sebelum memutuskan menghubungkan apa pun. Yang benar-benar
   * butuh dompet cuma pengirimannya, dan itu dijaga di langkah terakhir.
   */
  const blocked = useMemo(() => {
    if (step === 1) return id ? null : 'Pick one strategy.'
    if (step === 2 && id === 'meja-privat' && !isAddress(taker)) {
      return 'Enter a valid flow provider address.'
    }
    return null
  }, [step, id, taker])

  /** Kenapa posisinya belum bisa dikirim. */
  const shipBlocked = useMemo(() => {
    if (!address) return 'Connect your wallet to ship a position.'
    if (balances === null) return 'Balances have not loaded yet.'
    if (!hasCapital) return 'You need a balance in both tokens to open a position.'
    if (built && 'error' in built) return built.error
    if (!built) return 'The program cannot be assembled yet.'
    return null
  }, [address, balances, hasCapital, built])

  function go(next: number) {
    setStep(next)
    setFurthest((f) => Math.max(f, next))
  }

  async function ship() {
    if (!address || !built || 'error' in built) return
    setBusy(true); setError(null); setTxHash(null)
    try {
      const { hash } = await openPosition(
        address, DESK_PAIR[0].address, DESK_PAIR[1].address, split[0], split[1], built.order,
      )
      setTxHash(hash)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to ship the position.')
    } finally {
      setBusy(false)
    }
  }

  if (!DESK_CONFIGURED) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
        <PageHeader title="Open position" caption="Pick a strategy for the capital you set aside." />
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-zinc-500">
              Aqua is not configured. Set <span className="font-mono">VITE_AQUA</span> and{' '}
              <span className="font-mono">VITE_SWAP_VM_ROUTER</span> di{' '}
              <span className="font-mono">frontend/.env.local</span>.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Open position"
          caption="Your strategy is not a label — it is a bytecode program that genuinely changes the price your position quotes. The last step shows you that program as it is."
        />

        <Stepper at={step} done={furthest} onJump={go} />

        <Card>
          <CardContent className="space-y-5">
            {step === 0 && (
              <>
                <div>
                  <p className="text-sm text-zinc-300">How much of your balance goes to work?</p>
                  <p className="mt-1 text-xs text-spectral/60">
                    Tokens move nowhere. Aqua only records the allocation, and you can
                    close it at any time.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {PERCENT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPercent(p)}
                      className={cx(
                        'rounded-xl border px-4 py-2 text-sm transition',
                        percent === p
                          ? 'border-spectral/40 bg-spectral/10 text-spectral-soft'
                          : 'border-ink-800 bg-ink-900/40 text-zinc-400 hover:border-spectral/40 hover:bg-ink-800/60',
                      )}
                    >
                      {p}%
                    </button>
                  ))}
                </div>

                <label className="block">
                  <span className="text-xs text-spectral/60">Atur sendiri: {percent}%</span>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={percent}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    className="mt-2 w-full accent-spectral"
                  />
                </label>

                {!address && (
                  <p className="rounded-xl border border-ink-800 bg-ink-900/40 p-3 text-xs text-zinc-500">
                    Your wallet is not connected, so the numbers are empty. You can still read
                    keempat strategi dulu — hubungkan saat mau mengirim.
                  </p>
                )}

                <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                  {DESK_PAIR.map((t, i) => (
                    <Row key={t.symbol} label={`${t.symbol} set aside`}>
                      <span className="font-mono">{fmt(split[i], t.decimals)}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        of {balances ? fmt(balances[i], t.decimals) : '—'}
                      </span>
                    </Row>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {STRATEGIES.map((s) => {
                  const picked = id === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setId(s.id)}
                      className={cx(
                        'flex flex-col gap-2 rounded-xl border p-4 text-left transition',
                        picked
                          ? 'border-spectral/40 bg-spectral/[0.07]'
                          : 'border-ink-800 bg-ink-900/40 hover:border-spectral/40 hover:bg-ink-800/60',
                      )}
                      aria-pressed={picked}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-100">{s.name}</span>
                        {picked && <CheckIcon className="h-4 w-4 text-spectral-soft" />}
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-400">{s.summary}</p>
                      <p className="text-xs leading-relaxed text-zinc-500">
                        <span className="text-spectral/60">Good if </span>
                        {s.bestFor.replace(/^You /, 'you ')}
                      </p>
                      <p className="text-xs leading-relaxed text-yellow-300/70">{s.tradeoff}</p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-600">
                        {s.opcodes.join(' → ')}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}

            {step === 2 && id && (
              <>
                <label className="block">
                  <span className="text-sm text-zinc-300">The fee you take: {feePercent}%</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={feePercent}
                    onChange={(e) => setFeePercent(Number(e.target.value))}
                    className="mt-2 w-full accent-spectral"
                  />
                  <span className="mt-1 block text-xs text-spectral/60">
                    Out of every 1,000 USDC that passes through, {(feePercent * 10).toFixed(1)} USDC is yours.
                    The higher the fee, the fewer swaps choose your position.
                  </span>
                </label>

                {id === 'terkonsentrasi' && (
                  <div>
                    <p className="text-sm text-zinc-300">Lebar pita harga</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {BAND_PRESETS.map((b) => (
                        <button
                          key={b.bps}
                          type="button"
                          onClick={() => setBandBps(b.bps)}
                          className={cx(
                            'rounded-xl border p-3 text-left text-sm transition',
                            bandBps === b.bps
                              ? 'border-spectral/40 bg-spectral/10 text-spectral-soft'
                              : 'border-ink-800 bg-ink-900/40 text-zinc-400 hover:border-spectral/40 hover:bg-ink-800/60',
                          )}
                        >
                          <span className="font-medium">{b.label}</span>
                          <span className="mt-0.5 block text-xs text-zinc-500">{b.note}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-yellow-300/70">
                      Outside the band your position stops earning and ends up entirely on one
                      side of the pair. A narrower band is also not automatically better: if your
                      two balances are lopsided, the position is born leaning to one edge, and
                      the narrower the band, the sharper that lean.
                    </p>
                  </div>
                )}

                {id === 'anti-arbitrase' && (
                  <div>
                    <p className="text-sm text-zinc-300">Periode peluruhan</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DECAY_PRESETS.map((d) => (
                        <button
                          key={d.s}
                          type="button"
                          onClick={() => setDecayPeriod(d.s)}
                          className={cx(
                            'rounded-xl border px-4 py-2 text-sm transition',
                            decayPeriod === d.s
                              ? 'border-spectral/40 bg-spectral/10 text-spectral-soft'
                              : 'border-ink-800 bg-ink-900/40 text-zinc-400 hover:border-spectral/40 hover:bg-ink-800/60',
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-spectral/60">
                      The longer it is, the less arbitrage can take — but the longer your fair
                      price also takes to recover for ordinary swappers.
                    </p>
                  </div>
                )}

                {id === 'meja-privat' && (
                  <label className="block">
                    <span className="text-sm text-zinc-300">Alamat penyalur</span>
                    <TextInput
                      mono
                      placeholder="0x…"
                      value={taker}
                      onChange={(e) => setTaker(e.target.value)}
                      className="mt-2"
                    />
                    <span className="mt-1 block text-xs text-yellow-300/70">
                      Only this address can fill your position. If they go quiet, your position goes quiet.
                    </span>
                  </label>
                )}
              </>
            )}

            {step === 3 && id && (
              <>
                <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                  <Row label="Strategi">{strategyMeta(id).name}</Row>
                  {DESK_PAIR.map((t, i) => (
                    <Row key={t.symbol} label={t.symbol}>
                      <span className="font-mono">{fmt(split[i], t.decimals)}</span>
                    </Row>
                  ))}
                  <Row label="Fee">{feePercent}%</Row>
                  {id === 'terkonsentrasi' && <Row label="Pita">±{bandBps / 100}%</Row>}
                  {id === 'anti-arbitrase' && <Row label="Peluruhan">{decayPeriod} detik</Row>}
                  {id === 'meja-privat' && (
                    <Row label="Penyalur">
                      <span className="font-mono text-xs">{taker}</span>
                    </Row>
                  )}
                  {DESK_SURCHARGE_BPS > 0n && (
                    <Row label="Penjaga jaminan">maks {asPercent(DESK_SURCHARGE_BPS)}%</Row>
                  )}
                </div>

                {shipBlocked && (
                  <p className="rounded-xl border border-ink-800 bg-ink-900/40 p-3 text-center text-xs text-zinc-500">
                    {shipBlocked}
                  </p>
                )}

                {built && !('error' in built) && (
                  <div className="space-y-2">
                    <p className="text-xs text-spectral/60">
                      The program about to be shipped — this is the strategy, as it is:
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-xl border border-ink-800 bg-ink-950/60 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">
                      {built.order.encoded.data}
                    </pre>
                    <p className="break-all font-mono text-[10px] text-zinc-600">
                      strategyHash {built.hash}
                    </p>
                  </div>
                )}

                <p className="rounded-xl border border-ink-800 bg-ink-900/40 p-3 text-xs leading-relaxed text-zinc-500">
                  Your earnings come only from fees on swaps through your position — there is no lending,
                  staking, or farming behind this. If nobody swaps, the earnings are
                  zero. As a maker you will also tend to hold more of whichever asset is
                  turun.
                </p>

                <Button className="w-full" disabled={busy || shipBlocked !== null} loading={busy} onClick={() => void ship()}>
                  {busy ? 'Shipping…' : 'Ship position'}
                </Button>

                {txHash && (
                  <p className="text-center text-xs text-patina-300">
                    Position shipped ·{' '}
                    <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="hover:underline">
                      lihat transaksi
                    </a>
                  </p>
                )}
                {error && <p className="text-center text-xs text-yellow-300">{error}</p>}
              </>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-ink-800 pt-4">
              <Button
                variant="ghost"
                disabled={step === 0}
                onClick={() => go(step - 1)}
              >
                <ChevronLeftIcon className="h-4 w-4" /> Kembali
              </Button>

              <div className="flex items-center gap-3">
                {blocked && <span className="text-xs text-zinc-500">{blocked}</span>}
                {step < STEPS.length - 1 && (
                  <Button disabled={blocked !== null} onClick={() => go(step + 1)}>
                    Lanjut <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default StrategyPage
