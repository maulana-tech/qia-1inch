import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { CircleCheckIcon, PiggyBankIcon, WalletIcon } from 'lucide-react'

import {
  closePosition,
  openPosition,
  positionBalancesOrZero,
  savingsEarnings,
  sharedCapital,
  type SavingsEarnings,
  type SharedCapital,
  savingsOrder,
  splitAmounts,
  walletBalances,
} from '../lib/savings'
import {
  DESK_CONFIGURED,
  DESK_SURCHARGE_BPS,
  PROTOCOL_FEE_BPS,
  SAVINGS_FEE_BPS,
  MOCK_USDC_ADDRESS,
  MOCK_WETH_ADDRESS,
  explorerTxUrl,
} from '../lib/config'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Separator,
  Spinner,
} from '../components/ui'
import { cx } from '../lib/cx'
import { decodeOrder, fetchActiveStrategies } from '../lib/markets'
import { DESK_PAIR, isSavingsProgram } from '../lib/strategies'

/** Format satuan dasar jadi angka yang enak dibaca. */
function fmt(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (value % base).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

const TOKENS = DESK_PAIR

/**
 * Salt baru tiap posisi. Lihat catatan pada `strategyHash` di bawah — nilai
 * tetap membuat pembukaan kedua mustahil.
 */
const freshSalt = () => BigInt(Date.now())
const PRESETS = [10, 20, 35, 50] as const

/** Pilihan persentase, sebentuk dengan pemilih sumber yield pada acuannya. */
function PresetOption({
  percent,
  selected,
  disabled,
  onSelect,
}: {
  percent: number
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'group flex flex-1 items-center gap-3 rounded-xl border p-3 text-left outline-none transition-[border-color,box-shadow,transform] duration-150',
        selected
          ? 'border-spectral/50 bg-spectral/[0.07]'
          : disabled
            ? 'cursor-not-allowed border-spectral/10 opacity-60'
            : 'border-spectral/12 hover:-translate-y-0.5 hover:border-spectral/35',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-spectral/[0.07] font-mono text-xs text-spectral/80">
        {percent}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-spectral/85">{percent}%</span>
        <span className="block text-xs text-spectral/45">set aside</span>
      </span>
      {selected ? <CircleCheckIcon className="size-5 shrink-0 text-spectral/70" /> : null}
    </button>
  )
}

/**
 * Hasil yang sudah dipungut. Dari event, bukan ramalan.
 *
 * Sengaja tidak ada APY. Angka yang tidak bisa dipertanggungjawabkan lebih buruk
 * daripada tidak ada angka, dan posisi yang belum pernah dipakai memang belum
 * menghasilkan apa-apa — itu jawaban yang jujur, dan ditampilkan apa adanya.
 */
function Earnings({ earnings }: { earnings: SavingsEarnings | null }) {
  if (!earnings) return null

  if (earnings.swaps === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-spectral/80">Earned so far</p>
        <p className="text-sm text-spectral/50">
          Nobody has swapped through your position yet. Earnings show up here as soon as they do.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-spectral/80">Earned so far</p>
        <p className="text-xs text-spectral/45">
          {earnings.swaps} swaps since block {earnings.sinceBlock?.toString()}
        </p>
      </div>
      <div className="flex flex-wrap gap-8">
        {TOKENS.map((t) => {
          const earned = earnings.earned.get(t.address.toLowerCase()) ?? 0n
          const volume = earnings.volume.get(t.address.toLowerCase()) ?? 0n
          if (volume === 0n) return null
          return (
            <div key={t.symbol}>
              <div className="coord-label">{t.symbol}</div>
              <div className="font-mono text-lg tabular-nums text-spectral/90">
                +{fmt(earned, t.decimals)}
              </div>
              <div className="text-xs text-spectral/40">on {fmt(volume, t.decimals)} of volume</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Tabunganmu tidak eksklusif — dan itu fiturnya, bukan celahnya.
 *
 * Saldo yang sama menopang setiap posisi yang kamu buka. Ditampilkan di sini
 * supaya jelas bahwa "disisihkan" tidak berarti "terkunci di satu tempat".
 */
function SharedCapitalNote({ shared }: { shared: SharedCapital | null }) {
  if (!shared || shared.positions < 2) return null
  return (
    <div className="flex items-baseline justify-between gap-4">
      <p className="text-sm text-spectral/55">
        The same balance backs {shared.positions} markets at once.
      </p>
      <p className="font-mono text-lg tabular-nums text-spectral/90">
        {shared.multiple.toFixed(2)}×
      </p>
    </div>
  )
}

export function SavingsPage() {
  const { address } = useAccount()

  const [percent, setPercent] = useState(20)
  const [wallet, setWallet] = useState<[bigint, bigint]>([0n, 0n])
  const [position, setPosition] = useState<[bigint, bigint]>([0n, 0n])
  const [busy, setBusy] = useState<'open' | 'close' | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [earnings, setEarnings] = useState<SavingsEarnings | null>(null)
  const [shared, setShared] = useState<SharedCapital | null>(null)

  const configured = DESK_CONFIGURED && Boolean(MOCK_WETH_ADDRESS) && Boolean(MOCK_USDC_ADDRESS)

  /**
   * `strategyHash` posisi yang sedang terbuka, dicari dari event.
   *
   * Dulu dihitung ulang dari salt tetap, dan itu salah: Aqua menandai strategi
   * yang sudah di-`dock` sebagai `0xff` sementara `ship` menuntut `0`, jadi satu
   * hash cuma sah SEKALI. Dengan salt tetap, menutup lalu membuka lagi selalu
   * gagal dengan `StrategiesMustBeImmutable` — dan itu hal biasa yang dilakukan
   * orang pada percobaan kedua.
   */
  const [strategyHash, setStrategyHash] = useState<`0x${string}` | null>(null)

  const refresh = useCallback(async () => {
    if (!address || !configured) {
      setLoading(false)
      return
    }
    try {
      const [w, active] = await Promise.all([
        walletBalances(address, TOKENS[0].address, TOKENS[1].address),
        fetchActiveStrategies(address),
      ])
      setWallet(w)

      // Posisi tabungan dikenali dari BENTUK programnya, bukan dari urutannya.
      //
      // Dulu barisnya `active[0]?.hash` — posisi aktif pertama, jenis apa pun.
      // Kalau punya posisi Terkonsentrasi dari wizard, posisi ITU yang muncul
      // sebagai "tabunganmu", dan tombol Tutup menutupnya. Tombol yang merusak
      // hal yang salah.
      //
      // Cocoknya persis, termasuk parameter fee. Kalau fee protokolnya diubah,
      // posisi lama berhenti dikenali di sini — tetap terlihat dan bisa ditutup
      // dari halaman Portfolio, yang memang mendaftar semuanya.
      const mine =
        active.find((s) => {
          const order = decodeOrder(s.strategy)
          return (
            order !== null &&
            isSavingsProgram(order.data, {
              feeBps: SAVINGS_FEE_BPS,
              surchargeBps: DESK_SURCHARGE_BPS,
            })
          )
        })?.hash ?? null
      setStrategyHash(mine)
      setPosition(
        mine ? await positionBalancesOrZero(address, mine, TOKENS[0].address, TOKENS[1].address) : [0n, 0n],
      )
      setEarnings(mine ? await savingsEarnings(mine) : null)
      setShared(active.length ? await sharedCapital(address, active, TOKENS[0].address, TOKENS[1].address) : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read balances.')
    } finally {
      setLoading(false)
    }
  }, [address, configured])

  useEffect(() => { void refresh() }, [refresh])

  const isOpen = position[0] > 0n || position[1] > 0n
  const split = splitAmounts(wallet, percent)
  const canOpen = !isOpen && (split[0] > 0n || split[1] > 0n)
  const anyBusy = busy !== null

  async function handleOpen() {
    if (!address) return
    setBusy('open'); setError(null); setTxHash(null)
    try {
      const { hash } = await openPosition(
        address, TOKENS[0].address, TOKENS[1].address, split[0], split[1], savingsOrder(address, freshSalt()),
      )
      setTxHash(hash)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open the position.')
    } finally {
      setBusy(null)
    }
  }

  async function handleClose() {
    if (!address || !strategyHash) return
    setBusy('close'); setError(null); setTxHash(null)
    try {
      setTxHash(await closePosition(address, strategyHash, TOKENS[0].address, TOKENS[1].address))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close the position.')
    } finally {
      setBusy(null)
    }
  }

  if (!configured) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
        <section className="space-y-5">
          <PageHeader title="Savings" caption="Set aside part of your balance as liquidity." />
          <Card>
            <CardContent className="text-sm text-spectral/60">
              Aqua is not configured. Run <code>script/DemoIqiaDesk.s.sol</code>, then copy
              the env it prints into <code>frontend/.env.local</code>.
            </CardContent>
          </Card>
        </section>
      </div>
    )
  }

  if (!address) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
        <section className="space-y-5">
          <PageHeader title="Savings" caption="Set aside part of your balance as liquidity." />
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-spectral/[0.07]">
                <WalletIcon className="size-5 text-spectral/60" />
              </span>
              <p className="text-sm text-spectral/60">Connect a wallet to start saving.</p>
            </CardContent>
          </Card>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Savings"
          caption="The money stays in your wallet and stays spendable — only the allowance is recorded."
        />

        {loading ? (
          <Card>
            <CardContent className="flex items-center gap-3 text-sm text-spectral/60">
              <Spinner className="h-4 w-4" /> Reading balances…
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBankIcon className="size-4 text-spectral/70" />
                {isOpen ? 'Savings position' : 'Set up savings'}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              {isOpen ? (
                <>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-spectral/80">Currently working</p>
                    <div className="flex flex-wrap gap-8">
                      {TOKENS.map((t, i) => (
                        <div key={t.symbol}>
                          <div className="coord-label">{t.symbol}</div>
                          <div className="font-mono text-2xl tracking-tight tabular-nums text-spectral/90">
                            {fmt(position[i], t.decimals)}
                          </div>
                        </div>
                      ))}
                    </div>
                  <Separator />

                  <Earnings earnings={earnings} />

                  <SharedCapitalNote shared={shared} />

                  <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-spectral/55">
                        Every swap through your position takes {Number(SAVINGS_FEE_BPS) / 1e7}% for you
                        {PROTOCOL_FEE_BPS > 0n
                          ? `, and ${Number(PROTOCOL_FEE_BPS) / 1e7}% for this app`
                          : ''}
                        .
                      </p>
                      <Button size="sm" variant="ghost" disabled={anyBusy} onClick={handleClose}>
                        {busy === 'close' ? <Spinner className="h-4 w-4" /> : 'Close'}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-spectral/80">Share set aside</p>
                      <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-spectral/90">
                        {percent}%
                      </p>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={80}
                      step={5}
                      value={percent}
                      disabled={anyBusy}
                      onChange={(e) => setPercent(Number(e.currentTarget.value))}
                      className="h-1 w-full cursor-pointer appearance-none rounded bg-spectral/15 accent-spectral"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-spectral/55">
                        {percent}% of your balance works, {100 - percent}% stays free to spend.
                      </p>
                      <Button size="sm" disabled={!canOpen || anyBusy} onClick={handleOpen}>
                        {busy === 'open' ? <Spinner className="h-4 w-4" /> : 'Start'}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <PresetOption
                        key={p}
                        percent={p}
                        selected={percent === p}
                        disabled={anyBusy}
                        onSelect={() => setPercent(p)}
                      />
                    ))}
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium text-spectral/80">Wallet balance</p>
                <div className="flex flex-wrap gap-8">
                  {TOKENS.map((t, i) => (
                    <div key={t.symbol}>
                      <div className="coord-label">{t.symbol}</div>
                      <div className="font-mono text-lg tabular-nums text-spectral/85">
                        {fmt(wallet[i], t.decimals)}
                      </div>
                      {!isOpen ? (
                        <div className="mt-0.5 text-xs text-spectral/45">
                          {fmt(split[i], t.decimals)} set aside
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                {!canOpen && !isOpen && !anyBusy ? (
                  <p className="text-xs text-spectral/45">
                    Your wallet balance is still zero. Grab test tokens on the Deposit page first.
                  </p>
                ) : null}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium text-spectral/80">What you should know</p>
                <p className="text-sm text-spectral/55">
                  Saving here locks nothing. Opening a position transfers zero tokens, and so does
                  closing it. Tokens only move when someone swaps through your position.
                </p>
                <p className="text-sm text-spectral/55">
                  Because you can spend the balance at any time, your position's price adjusts as
                  the balance thins — a surcharge of up to {Number(DESK_SURCHARGE_BPS) / 1e7}% once the
                  backing runs out. That is what keeps the position safe even as your wallet changes.
                </p>
              </div>

              {error ? <p className="text-sm text-danger/90">{error}</p> : null}
              {txHash ? (
                <a
                  className="inline-block text-xs text-spectral/60 underline underline-offset-4 hover:text-spectral"
                  href={explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction ↗
                </a>
              ) : null}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}

export default SavingsPage
