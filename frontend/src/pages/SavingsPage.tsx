import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { CircleCheckIcon, PiggyBankIcon, WalletIcon } from 'lucide-react'

import {
  closePosition,
  openPosition,
  positionBalances,
  savingsOrder,
  splitAmounts,
  strategyHashOf,
  walletBalances,
} from '../lib/savings'
import {
  AQUA_CONFIGURED,
  DESK_SURCHARGE_BPS,
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

/** Format satuan dasar jadi angka yang enak dibaca. */
function fmt(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (value % base).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

const TOKENS = [
  { symbol: 'WETH', address: MOCK_WETH_ADDRESS, decimals: 18 },
  { symbol: 'USDC', address: MOCK_USDC_ADDRESS, decimals: 6 },
] as const

const SALT = 1_000n
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
        <span className="block text-xs text-spectral/45">disisihkan</span>
      </span>
      {selected ? <CircleCheckIcon className="size-5 shrink-0 text-spectral/70" /> : null}
    </button>
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

  const configured = AQUA_CONFIGURED && Boolean(MOCK_WETH_ADDRESS) && Boolean(MOCK_USDC_ADDRESS)

  const strategyHash = useMemo(
    () => (address ? strategyHashOf(savingsOrder(address, SALT)) : null),
    [address],
  )

  const refresh = useCallback(async () => {
    if (!address || !configured || !strategyHash) {
      setLoading(false)
      return
    }
    try {
      const [w, p] = await Promise.all([
        walletBalances(address, TOKENS[0].address, TOKENS[1].address),
        positionBalances(address, strategyHash, TOKENS[0].address, TOKENS[1].address),
      ])
      setWallet(w)
      setPosition(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca saldo.')
    } finally {
      setLoading(false)
    }
  }, [address, configured, strategyHash])

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
        address, TOKENS[0].address, TOKENS[1].address, split[0], split[1], SALT,
      )
      setTxHash(hash)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka posisi.')
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
      setError(err instanceof Error ? err.message : 'Gagal menutup posisi.')
    } finally {
      setBusy(null)
    }
  }

  if (!configured) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
        <section className="space-y-5">
          <PageHeader title="Savings" caption="Sisihkan sebagian saldo jadi likuiditas." />
          <Card>
            <CardContent className="text-sm text-spectral/60">
              Aqua belum dikonfigurasi. Jalankan <code>script/DemoIqiaDesk.s.sol</code>, lalu salin
              env yang dicetaknya ke <code>frontend/.env.local</code>.
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
          <PageHeader title="Savings" caption="Sisihkan sebagian saldo jadi likuiditas." />
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-spectral/[0.07]">
                <WalletIcon className="size-5 text-spectral/60" />
              </span>
              <p className="text-sm text-spectral/60">Hubungkan dompet untuk mulai menabung.</p>
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
          caption="Uangnya tetap di dompetmu dan tetap bisa dibelanjakan — yang tercatat cuma izin."
        />

        {loading ? (
          <Card>
            <CardContent className="flex items-center gap-3 text-sm text-spectral/60">
              <Spinner className="h-4 w-4" /> Membaca saldo…
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBankIcon className="size-4 text-spectral/70" />
                {isOpen ? 'Posisi tabungan' : 'Atur tabungan'}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              {isOpen ? (
                <>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-spectral/80">Sedang bekerja</p>
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
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-spectral/55">
                        Tiap swap lewat posisimu memungut {Number(SAVINGS_FEE_BPS) / 1e7}% untukmu.
                      </p>
                      <Button size="sm" variant="ghost" disabled={anyBusy} onClick={handleClose}>
                        {busy === 'close' ? <Spinner className="h-4 w-4" /> : 'Tutup'}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-spectral/80">Bagian yang disisihkan</p>
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
                        {percent}% dari saldomu bekerja, {100 - percent}% tetap bebas dibelanjakan.
                      </p>
                      <Button size="sm" disabled={!canOpen || anyBusy} onClick={handleOpen}>
                        {busy === 'open' ? <Spinner className="h-4 w-4" /> : 'Mulai'}
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
                <p className="text-sm font-medium text-spectral/80">Saldo dompet</p>
                <div className="flex flex-wrap gap-8">
                  {TOKENS.map((t, i) => (
                    <div key={t.symbol}>
                      <div className="coord-label">{t.symbol}</div>
                      <div className="font-mono text-lg tabular-nums text-spectral/85">
                        {fmt(wallet[i], t.decimals)}
                      </div>
                      {!isOpen ? (
                        <div className="mt-0.5 text-xs text-spectral/45">
                          {fmt(split[i], t.decimals)} disisihkan
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                {!canOpen && !isOpen && !anyBusy ? (
                  <p className="text-xs text-spectral/45">
                    Saldo dompetmu masih nol. Ambil token uji di halaman Deposit lebih dulu.
                  </p>
                ) : null}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium text-spectral/80">Yang perlu kamu tahu</p>
                <p className="text-sm text-spectral/55">
                  Menabung di sini tidak mengunci apa pun. Membuka posisi nol transfer token, dan
                  menutupnya juga. Yang berpindah hanya saat ada orang menukar lewat posisimu.
                </p>
                <p className="text-sm text-spectral/55">
                  Karena saldonya bisa kamu belanjakan kapan saja, harga posisimu ikut menyesuaikan
                  saat saldo menipis — biaya tambahan hingga {Number(DESK_SURCHARGE_BPS) / 1e7}% saat
                  sandaran habis. Itu yang membuat posisinya tetap aman meski dompetmu berubah.
                </p>
              </div>

              {error ? <p className="text-sm text-rose-300/90">{error}</p> : null}
              {txHash ? (
                <a
                  className="inline-block text-xs text-spectral/60 underline underline-offset-4 hover:text-spectral"
                  href={explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Lihat transaksi ↗
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
