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
import { AQUA_CONFIGURED, DESK_SURCHARGE_BPS, explorerTxUrl } from '../lib/config'
import { cx } from '../lib/cx'
import { Button, Card, CardContent, PageHeader, TextInput } from '../components/ui'

const STEPS = ['Modal', 'Strategi', 'Setelan', 'Kirim'] as const
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
  { bps: 500, label: '±5%', note: 'Paling padat, tapi paling cepat keluar pita dan paling condong kalau saldomu timpang.' },
  { bps: 1000, label: '±10%', note: 'Titik awal yang wajar untuk pasangan yang bergerak biasa.' },
  { bps: 2500, label: '±25%', note: 'Longgar. Jarang keluar pita, dan lebih tahan saldo timpang.' },
  { bps: 5000, label: '±50%', note: 'Nyaris rentang penuh. Keuntungannya tipis, risikonya juga.' },
] as const
const DECAY_PRESETS = [
  { s: 60, label: '1 menit' },
  { s: 300, label: '5 menit' },
  { s: 900, label: '15 menit' },
] as const

const SALT = 2_000n

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

  const [balances, setBalances] = useState<[bigint, bigint] | null>(null)
  const [busy, setBusy] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address || !AQUA_CONFIGURED) return
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
      salt: SALT,
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
  }, [id, feePercent, bandBps, decayPeriod, taker, hasCapital, split])

  const built = useMemo(() => {
    if (!address || !id || !params) return null
    try {
      const order = strategyOrder(address, id, params)
      return { order, hash: strategyHashOf(order) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Gagal merakit program.' } as const
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
    if (step === 1) return id ? null : 'Pilih satu strategi.'
    if (step === 2 && id === 'meja-privat' && !isAddress(taker)) {
      return 'Masukkan alamat penyalur yang valid.'
    }
    return null
  }, [step, id, taker])

  /** Kenapa posisinya belum bisa dikirim. */
  const shipBlocked = useMemo(() => {
    if (!address) return 'Hubungkan dompetmu untuk mengirim posisi.'
    if (balances === null) return 'Saldo belum terbaca.'
    if (!hasCapital) return 'Kamu butuh saldo di kedua token untuk membuka posisi.'
    if (built && 'error' in built) return built.error
    if (!built) return 'Program belum bisa dirakit.'
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
      setError(e instanceof Error ? e.message : 'Gagal mengirim posisi.')
    } finally {
      setBusy(false)
    }
  }

  if (!AQUA_CONFIGURED) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
        <PageHeader title="Buka posisi" caption="Pilih strategi untuk modal yang kamu sisihkan." />
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-zinc-500">
              Aqua belum dikonfigurasi. Isi <span className="font-mono">VITE_AQUA</span> dan{' '}
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
          title="Buka posisi"
          caption="Strategimu bukan label — ia program bytecode yang benar-benar mengubah harga yang dikutip posisimu. Langkah terakhir menampilkan programnya apa adanya."
        />

        <Stepper at={step} done={furthest} onJump={go} />

        <Card>
          <CardContent className="space-y-5">
            {step === 0 && (
              <>
                <div>
                  <p className="text-sm text-zinc-300">Berapa banyak saldomu yang ikut bekerja?</p>
                  <p className="mt-1 text-xs text-spectral/60">
                    Token tidak pindah ke mana pun. Aqua hanya mencatat alokasinya, dan kamu bisa
                    menutupnya kapan saja.
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
                    Dompetmu belum terhubung, jadi angkanya masih kosong. Kamu tetap bisa membaca
                    keempat strategi dulu — hubungkan saat mau mengirim.
                  </p>
                )}

                <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                  {DESK_PAIR.map((t, i) => (
                    <Row key={t.symbol} label={`${t.symbol} disisihkan`}>
                      <span className="font-mono">{fmt(split[i], t.decimals)}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        dari {balances ? fmt(balances[i], t.decimals) : '—'}
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
                        <span className="text-spectral/60">Cocok kalau </span>
                        {s.bestFor.replace(/^Kamu /, 'kamu ')}
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
                  <span className="text-sm text-zinc-300">Fee yang kamu pungut: {feePercent}%</span>
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
                    Dari tiap 1.000 USDC yang lewat, {(feePercent * 10).toFixed(1)} USDC jadi milikmu.
                    Makin tinggi fee-nya, makin sedikit swap yang memilih posisimu.
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
                      Di luar pita posisimu berhenti menghasilkan dan berakhir seluruhnya di satu
                      sisi aset. Pita lebih sempit juga tidak otomatis lebih menghasilkan: kalau
                      saldo kedua tokenmu timpang, posisinya lahir condong ke satu sisi pita, dan
                      makin sempit pitanya makin tajam kecondongan itu.
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
                      Makin panjang, makin sedikit yang bisa diambil arbitrase — tapi makin lama
                      juga harga wajarmu pulih untuk penukar biasa.
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
                      Hanya alamat ini yang bisa mengisi posisimu. Kalau mereka diam, posisimu diam.
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
                      Program yang akan dikirim — inilah strateginya, apa adanya:
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
                  Penghasilanmu hanya berasal dari fee swap yang lewat posisimu — tidak ada lending,
                  staking, atau farming di balik ini. Kalau tidak ada yang menukar, penghasilannya
                  nol. Sebagai maker kamu juga akan cenderung memegang lebih banyak aset yang sedang
                  turun.
                </p>

                <Button className="w-full" disabled={busy || shipBlocked !== null} loading={busy} onClick={() => void ship()}>
                  {busy ? 'Mengirim…' : 'Kirim posisi'}
                </Button>

                {txHash && (
                  <p className="text-center text-xs text-patina-300">
                    Posisi terkirim ·{' '}
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
